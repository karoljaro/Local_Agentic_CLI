import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { reduceAgentState } from '@/application/services/SessionReducer';
import { describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ModelChatInput, ModelPort } from '@/application/ports/ModelPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { SessionService } from '@/application/services/SessionService';
import { RunAgentTurn } from '@/application/use-cases/RunAgentTurn';
import { readConfig } from '@/composition/config';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asISODateTime, asSessionId } from '@/domain/Ids';
import { toOllamaTool } from '@/infrastructure/model/mappers/OllamaChatMapper';
import { OllamaModelAdapter } from '@/infrastructure/model/OllamaModelAdapter';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { withMockedFetch } from '@/test-support/withMockedFetch';

const toolNames = [
	'list_directory',
	'find_files',
	'read_file',
	'search_text',
	'create_file',
	'edit_file',
	'replace_file',
	'move_file',
	'delete_path',
];
const toolResponse = (name: string, args: unknown) =>
	new Response(
		JSON.stringify({
			message: { content: '', tool_calls: [{ function: { name, arguments: args } }] },
			done: true,
		}) + '\n',
	);

describe('production instruction surface at model request boundaries', () => {
	for (const [name, env] of [
		['default', {}],
		['blank override', { SYSTEM_PROMPT: ' \t\n ' }],
		['explicit override', { SYSTEM_PROMPT: '  Use current files.\nAnswer briefly.  ' }],
	] as const) {
		test(`sends ${name} once and all nine definitions through stale-edit recovery`, async () => {
			const { directory, cleanup } = await createTempDirectory('phase15-instructions-');
			try {
				const path = join(directory, 'settings.conf');
				await writeFile(path, 'mode=dev\n');
				const config = readConfig(env);
				const registry = createLocalToolExecutor({ workspaceRoot: directory });
				const definitions = registry.listTools();
				const requests: ModelChatInput[] = [];
				const store = new InMemorySessionStore();
				const adapter = new OllamaModelAdapter(
					config.OLLAMA_BASE_URL,
					SYNTHETIC_MODEL,
					config.OLLAMA_KEEP_ALIVE,
				);
				const model: ModelPort = {
					async *streamChat(input) {
						requests.push(structuredClone(input));
						expect(input.messages.slice(1)).toEqual(
							reduceAgentState(asSessionId('fixture'), store.events).messages,
						);
						expect(input.contextProfile).toEqual({
							contextWindowTokens: 16_384,
							maxOutputTokens: 4_096,
						});
						yield* adapter.streamChat(input);
					},
				};
				const turn = new RunAgentTurn({
					sessionStore: new SessionService(store),
					model,
					toolExecutor: registry,
					contextBuilder: new ContextBuilder({
						systemPrompt: config.SYSTEM_PROMPT,
						contextProfile: {
							contextWindowTokens: config.MODEL_CONTEXT_TOKENS,
							maxOutputTokens: config.MODEL_MAX_OUTPUT_TOKENS,
						},
					}),
					idGenerator: new BunUuidV7IdGenerator(),
					clock: { now: () => asISODateTime('2026-10-08T12:00:00.000Z') },
					approveToolCall: async () => true,
				});
				let round = 0;
				await withMockedFetch(
					async (_url, init) => {
						const body = JSON.parse(String(init?.body));
						const systemMessages = body.messages.filter(
							(message: { role: string }) => message.role === 'system',
						);
						expect(systemMessages).toEqual([{ role: 'system', content: config.SYSTEM_PROMPT }]);
						expect(body.messages[0]).toEqual(systemMessages[0]);
						expect(body.options).toEqual({ num_ctx: 16_384, num_predict: 4_096 });
						expect(body.truncate).toBe(false);
						expect(body.shift).toBe(false);
						expect(body.tools).toEqual(definitions.map(toOllamaTool));
						expect(
							body.tools.map((tool: { function: { name: string } }) => tool.function.name),
						).toEqual(toolNames);
						expect(
							JSON.stringify({ messages: systemMessages, tools: body.tools }).length,
						).toBeLessThanOrEqual(6_500);
						for (const tool of body.tools) {
							expect(Object.keys(tool)).toEqual(['type', 'function']);
							expect(Object.keys(tool.function)).toEqual(['name', 'description', 'parameters']);
						}
						const lastTool = body.messages.findLast(
							(message: { role: string }) => message.role === 'tool',
						);
						switch (round++) {
							case 0:
								return toolResponse('read_file', { path: 'settings.conf' });
							case 1:
								expect(JSON.parse(lastTool.content).content).toBe('mode=dev\n');
								await writeFile(path, 'mode=staging\n');
								return toolResponse('edit_file', {
									path: 'settings.conf',
									edits: [{ oldText: 'mode=dev', newText: 'mode=prod' }],
								});
							case 2:
								expect(JSON.parse(lastTool.content)).toEqual({
									error: {
										message:
											'oldText was not found in file: settings.conf (edit 1). Read it again and include exact context.',
									},
								});
								return toolResponse('read_file', { path: 'settings.conf' });
							case 3:
								expect(JSON.parse(lastTool.content).content).toBe('mode=staging\n');
								return toolResponse('edit_file', {
									path: 'settings.conf',
									edits: [{ oldText: 'mode=staging', newText: 'mode=prod' }],
								});
							case 4:
								expect(JSON.parse(lastTool.content)).toEqual({
									path: 'settings.conf',
									changed: true,
									editsApplied: 1,
								});
								return new Response('{"message":{"content":"Updated mode."},"done":true}\n');
							default:
								throw new Error('Unexpected extra model round.');
						}
					},
					async () => {
						for await (const _chunk of turn.run({
							sessionId: asSessionId('fixture'),
							prompt: 'Set mode to prod in settings.conf.',
						})) {
							// Exercise the real loop/executor/reducer/adapter; only the model response is scripted.
						}
					},
				);
				expect(round).toBe(5);
				for (const request of requests) {
					expect(request.tools).toEqual(definitions);
					expect(request.messages.filter((message) => message.role === 'system')).toEqual([
						{ role: 'system', content: config.SYSTEM_PROMPT },
					]);
				}
				expect(await readFile(path, 'utf8')).toBe('mode=prod\n');
				expect(store.events.filter((event) => event.type === 'tool.call.failed')).toHaveLength(1);
			} finally {
				await cleanup();
			}
		});
	}
});
