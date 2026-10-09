import { expect, spyOn, test } from 'bun:test';
import type { AgentEvent } from '@/domain/AgentEvent';
import { asSessionId } from '@/domain/Ids';
import { createRuntime } from '@/composition/createRuntime';
import { readConfig } from '@/composition/config';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { JsonModelPreferenceStore } from '@/infrastructure/persistence/JsonModelPreferenceStore';
import { Conversation } from '@/presentation/Conversation';
import {
	promptSubmittedEvent,
	assistantMessageCompletedEvent,
} from '@/test-support/AgentEventFixtures';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { withMockedFetch } from '@/test-support/withMockedFetch';

const OTHER = 'other-model';
const HISTORICAL = 'historical-model';
const MISSING = 'removed-model';
const cases: {
	label: string;
	historical: string;
	configured?: string;
	remembered?: string;
	models: string[];
	expected?: string;
}[] = [
	{
		label: 'historical installed retains resolved runtime choice',
		historical: HISTORICAL,
		remembered: SYNTHETIC_MODEL,
		models: [HISTORICAL, SYNTHETIC_MODEL],
		expected: SYNTHETIC_MODEL,
	},
	{
		label: 'historical missing with sole installed',
		historical: MISSING,
		models: [SYNTHETIC_MODEL],
		expected: SYNTHETIC_MODEL,
	},
	{
		label: 'remembered installed',
		historical: MISSING,
		remembered: OTHER,
		models: [SYNTHETIC_MODEL, OTHER],
		expected: OTHER,
	},
	{
		label: 'remembered missing with one installed',
		historical: MISSING,
		remembered: MISSING,
		models: [SYNTHETIC_MODEL],
		expected: SYNTHETIC_MODEL,
	},
	{
		label: 'remembered missing with many installed',
		historical: MISSING,
		remembered: MISSING,
		models: [SYNTHETIC_MODEL, OTHER],
	},
	{
		label: 'explicit installed overrides remembered and history',
		historical: HISTORICAL,
		configured: SYNTHETIC_MODEL,
		remembered: OTHER,
		models: [SYNTHETIC_MODEL, OTHER],
		expected: SYNTHETIC_MODEL,
	},
	{
		label: 'explicit missing surfaces unavailable',
		historical: HISTORICAL,
		configured: MISSING,
		remembered: SYNTHETIC_MODEL,
		models: [SYNTHETIC_MODEL],
	},
	{
		label: 'many installed requires manual selection',
		historical: HISTORICAL,
		models: [SYNTHETIC_MODEL, OTHER],
	},
	{ label: 'no installed models starts safely', historical: MISSING, models: [] },
];
for (const item of cases)
	test(`resume: ${item.label}`, async () => {
		const sessionId = asSessionId('old-session');
		const historical = [
			promptSubmittedEvent({ sessionId, prompt: 'Historical prompt', modelName: item.historical }),
			assistantMessageCompletedEvent({ sessionId, content: 'Historical answer' }),
		];
		const events: AgentEvent[] = [...historical];
		const reads = spyOn(JsonlSessionStore.prototype, 'readSessionEvents').mockImplementation(
			async (id) => events.filter((event) => event.sessionId === id),
		);
		const appends = spyOn(JsonlSessionStore.prototype, 'appendSessionEvent').mockImplementation(
			async (event) => {
				events.push(event);
			},
		);
		const preferenceRead = spyOn(
			JsonModelPreferenceStore.prototype,
			'readLastSelectedModel',
		).mockResolvedValue(item.remembered);
		const preferenceWrite = spyOn(
			JsonModelPreferenceStore.prototype,
			'writeLastSelectedModel',
		).mockResolvedValue(undefined);
		const providerModels: string[] = [];
		let conversation: Conversation | undefined;
		try {
			await withMockedFetch(
				async (url, init) => {
					if (String(url).endsWith('/api/tags'))
						return Response.json({ models: item.models.map((name) => ({ name })) });
					const body = JSON.parse(String(init?.body));
					providerModels.push(body.model);
					return body.stream
						? new Response(
								JSON.stringify({ message: { content: 'Continued answer' }, done: true }) + '\n',
							)
						: Response.json({
								model: body.model,
								done: true,
								done_reason: body.keep_alive === 0 ? 'unload' : 'load',
							});
				},
				async () => {
					const runtime = createRuntime(
						readConfig(item.configured === undefined ? {} : { OLLAMA_MODEL: item.configured }),
					);
					conversation = new Conversation(runtime, () => undefined);
					await conversation.initialize(sessionId);
					expect(runtime.getModelName()).toBe(item.expected);
					expect(conversation.history.slice(0, 2).map((entry) => entry.content)).toEqual([
						'Historical prompt',
						'Historical answer',
					]);
					expect(events).toEqual(historical);
					expect(providerModels).toEqual([]);
					expect(preferenceWrite).not.toHaveBeenCalled();
					if (item.expected === undefined) {
						await expect(
							collectAsyncIterable(runtime.runTurn({ sessionId, prompt: 'blocked' })),
						).rejects.toThrow('/model');
						expect(events).toEqual(historical);
					}
					if (item.models.length > 0) {
						const chosen = item.models.includes(OTHER) ? OTHER : SYNTHETIC_MODEL;
						expect(await conversation.switchModel(chosen)).toBe(true);
						expect(runtime.getModelName()).toBe(chosen);
						expect(preferenceWrite).toHaveBeenCalledWith(chosen);
						await collectAsyncIterable(
							runtime.runTurn({ sessionId, prompt: 'Continue', modelName: item.historical }),
						);
						expect(events.slice(0, 2)).toEqual(historical);
						expect(
							events.find(
								(event) => event.type === 'prompt.submitted' && event.prompt === 'Continue',
							),
						).toMatchObject({ modelName: chosen });
						expect(providerModels.at(-1)).toBe(chosen);
					}
				},
			);
		} finally {
			await conversation?.dispose();
			reads.mockRestore();
			appends.mockRestore();
			preferenceRead.mockRestore();
			preferenceWrite.mockRestore();
		}
	});
