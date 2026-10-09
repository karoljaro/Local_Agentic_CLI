import { describe, expect, test } from 'bun:test';
import { ModelSessionMemoryUpdater } from './ModelSessionMemoryUpdater';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { noMemoryDelta, sampleMemory } from '@/test-support/SessionMemoryFixtures';
import type { ModelStreamChunk } from '@/application/ports/ModelPort';

const input = () => ({
	memory: sampleMemory(),
	evidence: [
		{ messageId: 'user-1', role: 'user' as const, text: 'Use PostgreSQL.' },
		{ messageId: 'assistant-1', role: 'assistant' as const, text: 'Accepted.' },
	],
	modelName: 'test-chat',
	signal: new AbortController().signal,
});
const profile = { contextWindowTokens: 16384, maxOutputTokens: 4096 };
const response = (value: unknown): ModelStreamChunk[] => [
	{ contentDelta: JSON.stringify(value), finishReason: 'stop' },
];
describe('bounded provider-independent semantic operation', () => {
	test('uses selected chat port, schema, one system, no tools, same window and bounded generation', async () => {
		const model = new ScriptedModel([response(noMemoryDelta())]);
		const updater = new ModelSessionMemoryUpdater(model, profile, () => 'test-chat');
		expect(await updater.update(input())).toEqual(noMemoryDelta());
		const request = model.receivedInputs[0]!;
		expect(request.tools).toBeUndefined();
		expect(request.messages.filter((message) => message.role === 'system')).toHaveLength(1);
		expect(request.contextProfile).toEqual({ contextWindowTokens: 16384, maxOutputTokens: 1024 });
		expect(request.responseSchema?.['additionalProperties']).toBe(false);
		expect(request.messages[1]?.content).not.toContain('sourceMessageIds');
		expect(request.messages[0]?.content).toContain('never suggestions');
	});
	for (const [name, chunks] of [
		['malformed JSON', [{ contentDelta: '{oops', finishReason: 'stop' }]],
		['unknown fields', response({ ...noMemoryDelta(), files: [] })],
		[
			'oversized text',
			response({
				...noMemoryDelta(),
				goal: {
					mode: 'initial',
					text: 'x'.repeat(241),
					evidence: { messageId: 'user-1', quote: 'Use PostgreSQL.' },
				},
			}),
		],
		['partial response', [{ contentDelta: JSON.stringify(noMemoryDelta()) }]],
		[
			'truncated output',
			[{ contentDelta: JSON.stringify(noMemoryDelta()), finishReason: 'length' }],
		],
		['tool response', [{ contentDelta: '', finishReason: 'tool' }]],
		['oversized response', [{ contentDelta: 'x'.repeat(16001), finishReason: 'stop' }]],
	] as const)
		test(`rejects ${name} without a repair/retry call`, async () => {
			const model = new ScriptedModel([chunks as ModelStreamChunk[]]);
			await expect(new ModelSessionMemoryUpdater(model, profile).update(input())).rejects.toThrow();
			expect(model.receivedInputs).toHaveLength(1);
		});
	test('provider errors propagate only to optional caller; one attempt', async () => {
		const model = new ScriptedModel([new Error('offline')]);
		await expect(new ModelSessionMemoryUpdater(model, profile).update(input())).rejects.toThrow(
			'offline',
		);
		expect(model.receivedInputs).toHaveLength(1);
	});
	test('extraction preflight charges schema overhead and skips a small window', async () => {
		const model = new ScriptedModel([]);
		await expect(
			new ModelSessionMemoryUpdater(model, {
				contextWindowTokens: 2048,
				maxOutputTokens: 512,
			}).update(input()),
		).rejects.toThrow('budget');
		expect(model.receivedInputs).toEqual([]);
	});
	test('cancellation before dispatch produces no provider operation', async () => {
		const model = new ScriptedModel([]);
		const request = input();
		request.signal = AbortSignal.abort();
		await expect(new ModelSessionMemoryUpdater(model, profile).update(request)).rejects.toThrow();
		expect(model.receivedInputs).toEqual([]);
	});
	test('changed active selection discards output without choosing/activating a model', async () => {
		const model = new ScriptedModel([response(noMemoryDelta())]);
		let calls = 0;
		await expect(
			new ModelSessionMemoryUpdater(model, profile, () =>
				++calls === 1 ? 'test-chat' : 'new-chat',
			).update(input()),
		).rejects.toThrow('changed');
		expect(model.receivedInputs).toHaveLength(1);
	});
});
