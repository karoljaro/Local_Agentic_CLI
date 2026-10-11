import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { ModelSessionMemoryUpdater } from './ModelSessionMemoryUpdater';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { noMemoryDelta, sampleMemory } from '@/test-support/SessionMemoryFixtures';
import type { ModelStreamChunk } from '@/application/ports/ModelPort';
import { MemoryDeltaSchema } from '@/domain/SessionMemory';

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
		expect(request.messages[0]?.content).toContain('exclude unaccepted assistant proposals');
	});
	for (const [name, statements] of [
		[
			'minimal delta and valid empty output',
			[
				'Do not serialize full memory or restate unchanged goal/decisions/constraints/pending/problems/completed.',
				'No durable change: {"version":1,"goal":null,"changes":[]}',
			],
		],
		[
			'absent initial goal and unchanged high-level objective',
			[
				'Goal is the high-level user objective.',
				'Use initial only when memory.goal is null and current user evidence establishes it.',
				'An unchanged goal returns goal:null.',
				'Operational follow-ups are subordinate work, never goal replacements.',
			],
		],
		[
			'explicit goal replacement with current user evidence',
			['explicit-replacement requires current user evidence replacing the high-level objective.'],
		],
		[
			'settled means versus persistent restrictions',
			[
				'A decision is a settled choice of how to proceed (e.g. JSON instead of YAML)',
				'a constraint is a persistent user restriction/requirement limiting future actions (e.g. no new dependencies)',
				'not every imperative or one-command detail',
			],
		],
		[
			'user choices versus unaccepted proposals and guarded implementation reports',
			[
				'Explicit user choices may be decisions; exclude unaccepted assistant proposals',
				'Assistant decisions require committed implementation evidence and no unresolved turn failures; they remain assistant-reported.',
			],
		],
		[
			'keyed decision replacement and constraint revocation',
			[
				'replace a changed decision with one same-key upsert, never add a contradictory active choice',
				'Remove revoked choices/constraints by existing key; user permission lifting a restriction removes it.',
			],
		],
		[
			'pending, completion and problem transitions with minimal removals',
			[
				'Use the same task key across pending/completed/problems.',
				'Pending must be explicit; problems unresolved.',
				'Meaningful completed upserts clear matching pending/semantic problems; omit redundant removals.',
				'Remove resolved problems when no task completion is established.',
				'Pending/problem upserts reopen completed.',
				'Never infer completion from a successful response/tool alone; assistant completion requires no unresolved turn failures.',
			],
		],
		[
			'evidence origin, entailment, role and atomic host validation',
			[
				'a supplied current messageId and exact short quote supporting the change, not merely present in the source',
				'Goal/constraints require user evidence; cite user choices to the user.',
				'Source role determines basis.',
				'one invalid operation rejects all',
				'Files and tool/agent problems are host-owned; never change them.',
			],
		],
	] as const)
		test(`supplies the model-visible contract for ${name}`, async () => {
			const model = new ScriptedModel([response(noMemoryDelta())]);
			const updateInput = input();
			expect(await new ModelSessionMemoryUpdater(model, profile).update(updateInput)).toEqual(
				noMemoryDelta(),
			);
			const request = model.receivedInputs[0]!;
			const instruction = request.messages[0]!.content.split('\nResponse schema: ')[0]!;
			for (const statement of statements) expect(instruction).toContain(statement);
			expect(request.signal).toBe(updateInput.signal);
			expect(JSON.parse(request.messages[1]!.content).memory.goal).toEqual({
				text: updateInput.memory.goal.text,
			});
		});
	test('keeps the exact strict schema, nullable goal, empty changes and bounds unchanged', async () => {
		const model = new ScriptedModel([response(noMemoryDelta())]);
		await new ModelSessionMemoryUpdater(model, profile).update(input());
		const request = model.receivedInputs[0]!;
		const schema = JSON.stringify(request.responseSchema);
		expect(createHash('sha256').update(schema).digest('hex')).toBe(
			'623ac4855fe9441e0ad141596f08870006ce8a0c439e99796f3e82dcef978f3e',
		);
		expect(request.messages[0]!.content.split('\nResponse schema: ')[1]).toBe(schema);
		expect(MemoryDeltaSchema.parse(noMemoryDelta())).toEqual(noMemoryDelta());
		const operation = {
			operation: 'upsert',
			category: 'pending',
			key: 'tests',
			text: 'Run tests.',
			evidence: { messageId: 'user-1', quote: 'Run tests.' },
		};
		expect(
			MemoryDeltaSchema.safeParse({ ...noMemoryDelta(), changes: Array(12).fill(operation) })
				.success,
		).toBe(true); // Duplicate operations remain a separate host-validation concern.
		expect(
			MemoryDeltaSchema.safeParse({ ...noMemoryDelta(), changes: Array(13).fill(operation) })
				.success,
		).toBe(false);
		expect(MemoryDeltaSchema.safeParse({ ...noMemoryDelta(), extra: true }).success).toBe(false);
	});
	test('uses the configured lower output cap without model/provider-specific instructions', async () => {
		const model = new ScriptedModel([response(noMemoryDelta())]);
		await new ModelSessionMemoryUpdater(model, { ...profile, maxOutputTokens: 512 }).update(
			input(),
		);
		const request = model.receivedInputs[0]!;
		expect(request.contextProfile).toEqual({ ...profile, maxOutputTokens: 512 });
		expect(request.messages[0]!.content).not.toMatch(
			/qwen|gemma|ministral|ollama|temperature|top_p/i,
		);
		expect(request.tools).toBeUndefined();
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
