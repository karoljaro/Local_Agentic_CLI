import { describe, expect, test } from 'bun:test';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import type { ModelContextProfile } from '@/domain/ModelContextProfile';
import { asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ToolDefinition } from '@/domain/Tool';
import { TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { ContextBudgetExceededError, ContextBuilder } from './ContextBuilder';
import { estimateMessageTokens, estimateToolTokens } from './ModelRequestEstimator';

const tools = createLocalToolExecutor().listTools();
const systemPrompt = 'Use workspace-relative paths.';
const user = (content: string): ModelMessage => ({
	role: 'user',
	id: asMessageId(content),
	content,
});
const assistant = (content: string): ModelMessage => ({ role: 'assistant', content });
const compile = (
	messages: ModelMessage[],
	contextProfile = TEST_CONTEXT_PROFILE,
	definitions: ToolDefinition[] = tools,
	system = systemPrompt,
) =>
	new ContextBuilder({ systemPrompt: system, contextProfile }).build(
		{ sessionId: asSessionId('test'), messages },
		definitions,
	);
const readChain = (content: string): ModelMessage[] => [
	user('Read exact current file'),
	{
		role: 'assistant',
		content: 'Reading',
		toolCalls: [{ id: asToolCallId('read'), name: 'read_file', arguments: { path: 'large.txt' } }],
	},
	{ role: 'tool', toolCallId: asToolCallId('read'), toolName: 'read_file', content },
];
const smallProfile = { contextWindowTokens: 4_096, maxOutputTokens: 1_024 };

// Brute-force suffix enumeration is deliberately independent of reverse accumulation.
const referenceSuffix = (turns: ModelMessage[][], profile: ModelContextProfile): ModelMessage[] => {
	const mandatory = compile(turns.at(-1) ?? [], profile);
	let selected = turns.at(-1) ?? [];
	for (let start = turns.length - 2; start >= 0; start--) {
		const candidate = turns.slice(start).flat();
		const estimated =
			mandatory.diagnostics.estimatedFixedTokens +
			candidate.reduce((n, message) => n + estimateMessageTokens(message), 0);
		if (estimated > mandatory.diagnostics.estimatedInputLimitTokens) break;
		selected = candidate;
	}
	return [{ role: 'system', content: systemPrompt }, ...selected];
};

describe('bounded Context Compiler', () => {
	test('estimated equality fits with safety intact; one less token fails without stealing output', () => {
		const active = [user('Exact current request')];
		const measured = compile(active, smallProfile).diagnostics.estimatedInputTokens;
		const profile = { contextWindowTokens: 4_096, maxOutputTokens: 4_096 - 256 - measured };
		const exact = compile(active, profile);
		expect(exact.messages.slice(1)).toEqual(active);
		expect(exact.diagnostics.estimatedRemainingMarginTokens).toBe(0);
		expect(exact.diagnostics.safetyAllowanceTokens).toBe(256);
		expect(exact.contextProfile.maxOutputTokens).toBe(profile.maxOutputTokens);
		expect(() =>
			compile(active, { ...profile, maxOutputTokens: profile.maxOutputTokens + 1 }),
		).toThrow(ContextBudgetExceededError);
	});

	test('a retained completed tool turn keeps its assistant continuation, calls and results together', () => {
		const previous = [...readChain('Exact historical read result'), assistant('Read done')];
		const active = user('Next question');
		const result = compile([...previous, active]);
		expect(result.messages.slice(1)).toEqual([...previous, active]);
		expect(result.diagnostics.selectedCompletedTurns).toBe(1);
	});
	test('short canonical history, tool definitions and active turn remain exact', () => {
		const history = [user('Hello'), assistant('Hi'), user('Now inspect src/α.ts\n"exact"')];
		const before = structuredClone(history);
		const result = compile(history);
		expect(result.messages).toEqual([{ role: 'system', content: systemPrompt }, ...history]);
		expect(result.messages.slice(1)).toEqual(before);
		expect(result.messages[1]).toBe(history[0]!);
		expect(result.tools).toBe(tools);
		expect(result.tools).toHaveLength(9);
		expect(result.contextProfile).toEqual(TEST_CONTEXT_PROFILE);
		expect(result.diagnostics).toMatchObject({
			selectedCompletedTurns: 1,
			droppedCompletedTurns: 0,
			maxOutputTokens: 4_096,
			safetyAllowanceTokens: 1_024,
			estimatedInputLimitTokens: 11_264,
		});
		expect(result.diagnostics.estimatedRemainingMarginTokens).toBeGreaterThan(0);
		expect(history).toEqual(before);
	});

	test('long history keeps a chronological contiguous window of newest full turns', () => {
		const turns = Array.from({ length: 20 }, (_, i) => [
			user(`Question ${i} ${'q'.repeat(900)}`),
			assistant(`Answer ${i} ${'a'.repeat(900)}`),
		]);
		const active = [user('Current exact request')];
		const result = compile([...turns.flat(), ...active], smallProfile);
		expect(result.messages).toEqual(referenceSuffix([...turns, active], smallProfile));
		expect(result.diagnostics.selectedCompletedTurns).toBeGreaterThan(0);
		expect(result.diagnostics.droppedCompletedTurns).toBeGreaterThan(0);
		const selected = result.diagnostics.selectedCompletedTurns;
		expect(result.messages.slice(1)).toEqual([...turns.slice(-selected).flat(), ...active]);
		expect(result.contextProfile.maxOutputTokens).toBe(1_024);
		expect(result.diagnostics.estimatedRemainingMarginTokens).toBeGreaterThanOrEqual(0);
	});

	test('stops at the first oversized older turn instead of skipping to an earlier small turn', () => {
		const small = [user('Small older question'), assistant('Small answer')];
		const huge = [user('Large recent question'), assistant('x'.repeat(20_000))];
		const active = user('Current');
		const result = compile([...small, ...huge, active], smallProfile);
		expect(result.messages.slice(1)).toEqual([active]);
		expect(result.diagnostics).toMatchObject({
			selectedCompletedTurns: 0,
			droppedCompletedTurns: 2,
		});
	});

	test('all nine tools consume fixed budget and can displace history', () => {
		const history = [user('x'.repeat(5_000)), assistant('Old answer'), user('Current')];
		const withoutTools = compile(history, smallProfile, []);
		const withTools = compile(history, smallProfile);
		expect(withoutTools.diagnostics.selectedCompletedTurns).toBe(1);
		expect(withTools.diagnostics.selectedCompletedTurns).toBe(0);
		expect(withTools.tools).toHaveLength(9);
		expect(
			withTools.diagnostics.estimatedFixedTokens - withoutTools.diagnostics.estimatedFixedTokens,
		).toBe(tools.reduce((n, tool) => n + estimateToolTokens(tool), 0));
	});

	test('a huge old read_file result drops its entire turn with calls/results intact', () => {
		const huge = [
			...readChain(JSON.stringify({ path: 'large.txt', content: 'x'.repeat(40_000) })),
			assistant('Read completed'),
		];
		const recent = [user('Recent'), assistant('Recent answer')];
		const active = user('Current');
		const result = compile([...huge, ...recent, active]);
		expect(result.messages.slice(1)).toEqual([...recent, active]);
		expect(result.diagnostics).toMatchObject({
			selectedCompletedTurns: 1,
			droppedCompletedTurns: 1,
		});
		expect(result.messages.some((message) => message.role === 'tool')).toBe(false);
	});

	test('a large current read_file result remains exact when mandatory context fits', () => {
		const chain = readChain(
			JSON.stringify({ path: 'large.txt', content: 'x'.repeat(12_000) + '\n😀\\"' }),
		);
		const result = compile(chain);
		expect(result.messages.slice(1)).toEqual(chain);
		expect(result.messages.at(-1)).toBe(chain.at(-1)!);
		expect(result.diagnostics.estimatedActiveTurnTokens).toBeGreaterThan(4_000);
		expect(result.diagnostics.estimatedRemainingMarginTokens).toBeGreaterThan(0);
	});

	test('mandatory overflow includes fixed overhead and preserves the full output reserve', () => {
		const chain = readChain('x'.repeat(40_000));
		const original = structuredClone(chain);
		try {
			compile(chain);
			throw new Error('Expected overflow');
		} catch (error) {
			expect(error).toBeInstanceOf(ContextBudgetExceededError);
			const overflow = error as ContextBudgetExceededError;
			expect(overflow.message).toContain(
				'active request itself exceeds the configured model context budget',
			);
			expect(overflow.diagnostics.maxOutputTokens).toBe(4_096);
			expect(overflow.diagnostics.estimatedRemainingMarginTokens).toBeLessThan(0);
		}
		expect(chain).toEqual(original);
	});

	test('system override and tools participate even before prompt persistence', () => {
		const prompt = 'x'.repeat(7_000);
		const builder = new ContextBuilder({
			systemPrompt: 'custom '.repeat(4_000),
			contextProfile: TEST_CONTEXT_PROFILE,
		});
		expect(() => builder.assertPromptFits(prompt, asMessageId('prompt'), tools)).toThrow(
			ContextBudgetExceededError,
		);
		expect(() =>
			new ContextBuilder({ systemPrompt, contextProfile: TEST_CONTEXT_PROFILE }).assertPromptFits(
				prompt,
				asMessageId('prompt'),
				tools,
			),
		).not.toThrow();
		const custom = compile([user('Current')], TEST_CONTEXT_PROFILE, tools, 'Exact custom system\n');
		expect(custom.messages[0]).toEqual({ role: 'system', content: 'Exact custom system\n' });
		expect(custom.messages.filter((message) => message.role === 'system')).toHaveLength(1);
	});

	test('active multi-call batches, failures and stale-edit recovery retain every exact message', () => {
		const first = readChain('{"content":"mode=dev\\n"}');
		const recovery: ModelMessage[] = [
			...first,
			{
				role: 'assistant',
				content: 'Editing',
				toolCalls: [
					{
						id: asToolCallId('edit'),
						name: 'edit_file',
						arguments: {
							path: 'settings.conf',
							edits: [{ oldText: 'mode=dev', newText: 'mode=prod' }],
						},
					},
					{ id: asToolCallId('second'), name: 'read_file', arguments: { path: 'second.conf' } },
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('edit'),
				toolName: 'edit_file',
				content: '{"error":{"message":"oldText missing; read again"}}',
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('second'),
				toolName: 'read_file',
				content: 'second exact result',
			},
			{
				role: 'assistant',
				content: 'Rereading',
				toolCalls: [
					{ id: asToolCallId('reread'), name: 'read_file', arguments: { path: 'settings.conf' } },
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('reread'),
				toolName: 'read_file',
				content: '{"content":"mode=staging\\n"}',
			},
			{
				role: 'assistant',
				content: 'Retry',
				toolCalls: [
					{
						id: asToolCallId('retry'),
						name: 'edit_file',
						arguments: {
							path: 'settings.conf',
							edits: [{ oldText: 'mode=staging', newText: 'mode=prod' }],
						},
					},
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('retry'),
				toolName: 'edit_file',
				content: '{"changed":true}',
			},
		];
		for (const end of [3, 6, 8, 10]) {
			const prefix = recovery.slice(0, end);
			const result = compile([user('old'), assistant('x'.repeat(40_000)), ...prefix]);
			expect(result.messages.slice(1)).toEqual(prefix);
			expect(result.tools).toHaveLength(9);
			const calls = prefix.flatMap((message) =>
				message.role === 'assistant' ? (message.toolCalls ?? []) : [],
			);
			const results = prefix.filter((message) => message.role === 'tool');
			expect(
				results.map((message) => (message.role === 'tool' ? message.toolCallId : undefined)),
			).toEqual(calls.map((call) => call.id));
		}
	});

	test('8192/2048 override changes the input ceiling and selected suffix together', () => {
		const history = Array.from({ length: 12 }, (_, i) => [
			user(String(i)),
			assistant('x'.repeat(2_000)),
		]).flat();
		const active = user('Current');
		const normal = compile([...history, active]);
		const override = compile([...history, active], {
			contextWindowTokens: 8_192,
			maxOutputTokens: 2_048,
		});
		expect(override.diagnostics).toMatchObject({
			contextWindowTokens: 8_192,
			maxOutputTokens: 2_048,
			safetyAllowanceTokens: 512,
			estimatedInputLimitTokens: 5_632,
		});
		expect(override.diagnostics.selectedCompletedTurns).toBeLessThan(
			normal.diagnostics.selectedCompletedTurns,
		);
		expect(override.messages.at(-1)).toBe(active);
	});

	test('empty state still compiles one system and all tools; hidden system injection is rejected', () => {
		const result = compile([]);
		expect(result.messages).toEqual([{ role: 'system', content: systemPrompt }]);
		expect(result.tools).toHaveLength(9);
		expect(result.diagnostics).toMatchObject({
			selectedCompletedTurns: 0,
			droppedCompletedTurns: 0,
			estimatedActiveTurnTokens: 0,
		});
		expect(() => compile([{ role: 'system', content: 'Hidden system' }])).toThrow(
			'Canonical model history must not contain system instructions',
		);
	});

	test('preserves canonical legacy leading groups and consecutive user boundaries', () => {
		const history = [assistant('Legacy leading text'), user('One'), user('Two')];
		expect(compile(history).messages.slice(1)).toEqual(history);
	});

	test('serializes considered messages once and does not inspect history beyond cutoff', () => {
		const visits = [0, 0, 0, 0];
		const observed = (index: number, value: string): ModelMessage => ({
			role: 'user',
			id: asMessageId(String(index)),
			get content() {
				visits[index]! += 1;
				return value;
			},
		});
		compile([
			observed(0, 'Unvisited'),
			observed(1, 'x'.repeat(40_000)),
			observed(2, 'Recent'),
			observed(3, 'Current'),
		]);
		expect(visits).toEqual([0, 1, 1, 1]);
	});

	test('all-fitting selection is linear in messages, and fresh compiles see changed results', () => {
		let visits = 0;
		let text = 'Short';
		const history: ModelMessage[] = Array.from({ length: 40 }, (_, i) => ({
			role: 'user',
			id: asMessageId(String(i)),
			get content() {
				visits += 1;
				return text;
			},
		}));
		const builder = new ContextBuilder({ systemPrompt, contextProfile: TEST_CONTEXT_PROFILE });
		const state = { sessionId: asSessionId('test'), messages: history };
		expect(builder.build(state, tools).diagnostics.selectedCompletedTurns).toBe(39);
		expect(visits).toBe(40);
		text = 'x'.repeat(5_000);
		const next = builder.build(state, tools);
		expect(next.diagnostics.selectedCompletedTurns).toBeLessThan(39);
		expect(visits).toBeLessThanOrEqual(80);
	});

	for (const profile of [
		{ contextWindowTokens: 0, maxOutputTokens: 1 },
		{ contextWindowTokens: -1, maxOutputTokens: 1 },
		{ contextWindowTokens: 8_192.5, maxOutputTokens: 1 },
		{ contextWindowTokens: 8_192, maxOutputTokens: 0 },
		{ contextWindowTokens: 8_192, maxOutputTokens: -1 },
		{ contextWindowTokens: 8_192, maxOutputTokens: 2.5 },
		{ contextWindowTokens: 8_192, maxOutputTokens: 8_192 },
		{ contextWindowTokens: 8_192, maxOutputTokens: 16_384 },
	])
		test(`invalid profile rejected: ${JSON.stringify(profile)}`, () =>
			expect(() => compile([], profile)).toThrow());
});

describe('conservative model-facing estimator', () => {
	test('measures ASCII JSON at /3 plus framing; UTF-8 non-ASCII bytes individually', () => {
		const ascii = { role: 'assistant', content: 'a'.repeat(300) } as const;
		expect(estimateMessageTokens(ascii)).toBe(Math.ceil(JSON.stringify(ascii).length / 3) + 16);
		const unicode = { role: 'assistant', content: '界😀' } as const;
		const serialized = JSON.stringify(unicode);
		const asciiBytes = serialized.replace(/[^\x00-\x7F]/gu, '').length;
		expect(estimateMessageTokens(unicode)).toBe(Math.ceil(asciiBytes / 3) + 7 + 16);
	});

	test('IDs/lifecycle metadata are excluded while calls, arguments, results and escaping contribute', () => {
		const base = user('Exact "quote"\\\n\t\ud800');
		expect(estimateMessageTokens(base)).toBe(
			estimateMessageTokens({ ...base, id: asMessageId('id'.repeat(10_000)) }),
		);
		const tool = tools[0]!;
		expect(estimateToolTokens(tool)).toBe(
			estimateToolTokens({
				...tool,
				requiresApproval: true,
				deduplicate: true,
				invalidatesWorkspaceCache: true,
			}),
		);
		const plain = assistant('Checking');
		const withCall: ModelMessage = {
			...plain,
			role: 'assistant',
			toolCalls: [{ name: 'read_file', arguments: { path: 'x'.repeat(300) } }],
		};
		expect(estimateMessageTokens(withCall)).toBeGreaterThan(estimateMessageTokens(plain));
	});
});
