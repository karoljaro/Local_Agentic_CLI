import { describe, expect, test } from 'bun:test';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';
import type { ModelContextProfile } from '@/domain/ModelContextProfile';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ToolDefinition } from '@/domain/Tool';
import { TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { ContextBudgetExceededError, ContextBuilder } from './ContextBuilder';
import type { HistoryRetrieval } from './HistoryRetriever';
import { estimateMessageTokens, estimateToolTokens } from './ModelRequestEstimator';

const systemPrompt = 'Use workspace-relative paths.';
const tools = createLocalToolExecutor().listTools();
const user = (id: string, content = id): ModelMessage => ({
	role: 'user',
	id: asMessageId(id),
	content,
});
const assistant = (content: string): ModelMessage => ({ role: 'assistant', content });
const turn = (id: string, content = id): ModelMessage[] => [
	user(id, content),
	assistant(`${id} answer`),
];
const candidate = (turnId: string, score = 1): HistoryRetrieval['candidates'][number] => ({
	turnId,
	score,
});
const semantic = (
	candidates: HistoryRetrieval['candidates'] = [],
	considered = candidates.length,
): HistoryRetrieval => ({
	enabled: true,
	candidates,
	candidatesConsidered: considered,
});
const compile = (
	turns: ModelMessage[][],
	retrieval: HistoryRetrieval = semantic(),
	profile: ModelContextProfile = TEST_CONTEXT_PROFILE,
	definitions: ToolDefinition[] = tools,
) =>
	new ContextBuilder({ systemPrompt, contextProfile: profile }).build(
		{ sessionId: asSessionId('selected-session'), messages: turns.flat() },
		definitions,
		retrieval,
	);
const cost = (messages: ModelMessage[]): number =>
	messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
const exactBudgetProfile = (inputTokens: number): ModelContextProfile => ({
	contextWindowTokens: 16_384,
	maxOutputTokens: 16_384 - 1_024 - inputTokens,
});

describe('semantic history Context Compiler', () => {
	test('no old history contains exact active context and zero retrieval', () => {
		const active = [user('active', 'Current exact question\nα😀')];
		const compiled = compile([active]);
		expect(compiled.messages).toEqual([{ role: 'system', content: systemPrompt }, ...active]);
		expect(compiled.messages[1]).toBe(active[0]!);
		expect(compiled.diagnostics).toMatchObject({
			retrievalEnabled: true,
			retrievedTurnCount: 0,
			selectedCompletedTurns: 0,
			droppedCompletedTurns: 0,
		});
	});

	test('empty canonical state is legal with only mandatory system and tools', () => {
		const compiled = compile([]);
		expect(compiled.messages).toEqual([{ role: 'system', content: systemPrompt }]);
		expect(compiled.tools).toBe(tools);
		expect(compiled.diagnostics.retrievedTurnCount).toBe(0);
	});

	test('previous complete turn is retained exactly without needing a semantic candidate', () => {
		const previous = turn('previous', 'Explain the last result.');
		const active = [user('active', 'Continue.')];
		const compiled = compile([previous, active]);
		expect(compiled.messages.slice(1)).toEqual([...previous, ...active]);
		for (const [index, message] of previous.entries())
			expect(compiled.messages[index + 1]).toBe(message);
		expect(compiled.diagnostics).toMatchObject({
			selectedCompletedTurns: 1,
			retrievedTurnCount: 0,
			retrievedEstimatedTokens: 0,
		});
	});

	test('successful zero-match retrieval leaves irrelevant old turns and unused budget out', () => {
		const irrelevant = [turn('gardening'), turn('css'), turn('logs')];
		const previous = turn('previous');
		const active = [user('active', 'How do migrations work?')];
		const compiled = compile([...irrelevant, previous, active], semantic([], irrelevant.length));
		expect(compiled.messages.slice(1)).toEqual([...previous, ...active]);
		expect(compiled.diagnostics).toMatchObject({
			historicalCandidatesConsidered: 3,
			retrievedTurnCount: 0,
			selectedCompletedTurns: 1,
			droppedCompletedTurns: 3,
		});
		expect(compiled.diagnostics.estimatedRemainingMarginTokens).toBeGreaterThan(0);
	});

	test('relevant older canonical unit appears before previous and exact active chain', () => {
		const relevant = turn('db-choice', 'Use PostgreSQL rather than SQLite.');
		const unrelated = turn('unrelated', 'Investigate stylesheet fonts.');
		const previous = turn('previous');
		const active = [user('active', 'What migration behavior follows from our database choice?')];
		const compiled = compile(
			[relevant, unrelated, previous, active],
			semantic([candidate('db-choice', 0.94)], 2),
		);
		expect(compiled.messages.slice(1)).toEqual([...relevant, ...previous, ...active]);
		expect(compiled.messages[1]).toBe(relevant[0]!);
		expect(compiled.diagnostics).toMatchObject({
			historicalCandidatesConsidered: 2,
			retrievedTurnCount: 1,
			retrievedEstimatedTokens: cost(relevant),
			selectedCompletedTurns: 2,
			droppedCompletedTurns: 1,
		});
	});

	test('selection follows similarity rank but final payload is chronological', () => {
		const oldest = turn('oldest');
		const middle = turn('middle');
		const newer = turn('newer');
		const previous = turn('previous');
		const active = [user('active')];
		const compiled = compile(
			[oldest, middle, newer, previous, active],
			semantic([candidate('newer', 0.99), candidate('oldest', 0.95), candidate('middle', 0.8)]),
		);
		expect(compiled.messages.slice(1)).toEqual([
			...oldest,
			...middle,
			...newer,
			...previous,
			...active,
		]);
		expect(compiled.diagnostics.retrievedTurnCount).toBe(3);
	});

	test('at most three relevant old turns are selected without arbitrary recency refill', () => {
		const old = Array.from({ length: 7 }, (_, index) => turn(`old-${index}`));
		const previous = turn('previous');
		const active = [user('active')];
		const candidates = [
			candidate('old-5', 0.99),
			candidate('old-0', 0.97),
			candidate('old-3', 0.9),
			candidate('old-6', 0.89),
			candidate('old-1', 0.8),
		];
		const compiled = compile([...old, previous, active], semantic(candidates, old.length));
		expect(compiled.messages.slice(1)).toEqual([
			...old[0]!,
			...old[3]!,
			...old[5]!,
			...previous,
			...active,
		]);
		expect(compiled.diagnostics).toMatchObject({
			retrievedTurnCount: 3,
			selectedCompletedTurns: 4,
			droppedCompletedTurns: 4,
		});
		expect(compiled.diagnostics.estimatedRemainingMarginTokens).toBeGreaterThan(0);
	});

	test('duplicate candidates and exact previous/active IDs never duplicate canonical turns', () => {
		const old = turn('old');
		const previous = turn('previous');
		const active = [user('active')];
		const compiled = compile(
			[old, previous, active],
			semantic([
				candidate('previous'),
				candidate('active'),
				candidate('old'),
				candidate('old'),
				candidate('previous'),
			]),
		);
		expect(compiled.messages.slice(1)).toEqual([...old, ...previous, ...active]);
		expect(
			compiled.messages.filter((message) => message.role === 'user').map((message) => message.id),
		).toEqual(['old', 'previous', 'active'].map(asMessageId));
		expect(compiled.diagnostics.retrievedTurnCount).toBe(1);
	});

	test('unknown candidate identity cannot inject payload from another session or index', () => {
		const old = turn('selected-old');
		const previous = turn('previous');
		const active = [user('active')];
		const compiled = compile([old, previous, active], semantic([candidate('other-session-turn')]));
		expect(compiled.messages.slice(1)).toEqual([...previous, ...active]);
		expect(compiled.diagnostics.retrievedTurnCount).toBe(0);
	});

	test('previous exact context wins when only it or a relevant older turn fits', () => {
		const old = turn('old', 'Relevant historical migration details.');
		const previous = turn('previous', 'Immediate continuity.');
		const active = [user('active')];
		const mandatory = compile([active]);
		const profile = exactBudgetProfile(mandatory.diagnostics.estimatedInputTokens + cost(previous));
		const compiled = compile([old, previous, active], semantic([candidate('old')]), profile);
		expect(compiled.messages.slice(1)).toEqual([...previous, ...active]);
		expect(compiled.diagnostics).toMatchObject({
			retrievedTurnCount: 0,
			skippedOversizedCandidates: 1,
			estimatedRemainingMarginTokens: 0,
		});
		expect(compiled.contextProfile.maxOutputTokens).toBe(profile.maxOutputTokens);
	});

	test('oversized previous context is omitted atomically while a small relevant older turn can fit', () => {
		const old = turn('old');
		const previous = turn('previous', 'x'.repeat(100_000));
		const active = [user('active')];
		const compiled = compile(
			[old, previous, active],
			semantic([candidate('old'), candidate('previous')]),
		);
		expect(compiled.messages.slice(1)).toEqual([...old, ...active]);
		expect(compiled.diagnostics).toMatchObject({
			retrievedTurnCount: 1,
			selectedCompletedTurns: 1,
			droppedCompletedTurns: 1,
		});
	});

	test('oversized highest-ranked candidate is skipped whole and next smaller candidate can fit', () => {
		const huge = turn('huge', 'h'.repeat(100_000));
		const small = turn('small', 'Use PostgreSQL.');
		const previous = turn('previous');
		const active = [user('active')];
		const compiled = compile(
			[huge, small, previous, active],
			semantic([candidate('huge', 0.99), candidate('small', 0.9)]),
		);
		expect(compiled.messages.slice(1)).toEqual([...small, ...previous, ...active]);
		expect(compiled.messages.some((message) => message.id === 'huge')).toBe(false);
		expect(compiled.diagnostics).toMatchObject({
			skippedOversizedCandidates: 1,
			retrievedTurnCount: 1,
			retrievedEstimatedTokens: cost(small),
		});
	});

	test('rank determines the winning candidate when two old turns individually fit but not together', () => {
		const oldest = turn('oldest', 'Database migration decision.');
		const newer = turn('newer', 'Database migration details.');
		const previous = turn('previous');
		const active = [user('active')];
		const mandatory = compile([active]);
		const profile = exactBudgetProfile(
			mandatory.diagnostics.estimatedInputTokens + cost(previous) + cost(newer),
		);
		const compiled = compile(
			[oldest, newer, previous, active],
			semantic([candidate('newer', 0.99), candidate('oldest', 0.95)]),
			profile,
		);
		expect(compiled.messages.slice(1)).toEqual([...newer, ...previous, ...active]);
		expect(compiled.diagnostics).toMatchObject({
			retrievedTurnCount: 1,
			skippedOversizedCandidates: 1,
			estimatedRemainingMarginTokens: 0,
		});
	});

	test('default tools, output reservation and safety remain intact with semantic payload', () => {
		const old = turn('old', 'Use PostgreSQL.');
		const previous = turn('previous');
		const active = [user('active')];
		const compiled = compile([old, previous, active], semantic([candidate('old')]));
		expect(compiled.tools).toBe(tools);
		expect(compiled.tools).toHaveLength(9);
		expect(compiled.contextProfile).toEqual({
			contextWindowTokens: 16_384,
			maxOutputTokens: 4_096,
		});
		expect(compiled.diagnostics).toMatchObject({
			safetyAllowanceTokens: 1_024,
			estimatedInputLimitTokens: 11_264,
			estimatedSelectedHistoryTokens: cost([...old, ...previous]),
			retrievedEstimatedTokens: cost(old),
		});
		expect(compiled.diagnostics.estimatedInputTokens).toBe(
			compiled.diagnostics.estimatedFixedTokens + cost([...old, ...previous, ...active]),
		);
		expect(
			compiled.diagnostics.estimatedInputTokens +
				compiled.diagnostics.safetyAllowanceTokens +
				compiled.contextProfile.maxOutputTokens,
		).toBeLessThanOrEqual(compiled.contextProfile.contextWindowTokens);
		expect(compiled.diagnostics.estimatedRemainingMarginTokens).toBe(
			11_264 - compiled.diagnostics.estimatedInputTokens,
		);
	});

	test('all nine definitions still displace retrieved payload through the existing shared budget', () => {
		const old = turn('old');
		const previous = turn('previous');
		const active = [user('active')];
		const withoutTools = compile([active], semantic(), TEST_CONTEXT_PROFILE, []);
		const toolsCost = tools.reduce((sum, tool) => sum + estimateToolTokens(tool), 0);
		const profile = exactBudgetProfile(
			withoutTools.diagnostics.estimatedInputTokens + toolsCost + cost(previous),
		);
		const withDefinitions = compile([old, previous, active], semantic([candidate('old')]), profile);
		const withoutDefinitions = compile(
			[old, previous, active],
			semantic([candidate('old')]),
			profile,
			[],
		);
		expect(withDefinitions.messages.slice(1)).toEqual([...previous, ...active]);
		expect(withoutDefinitions.messages.slice(1)).toEqual([...old, ...previous, ...active]);
		expect(
			withDefinitions.diagnostics.estimatedFixedTokens -
				withoutDefinitions.diagnostics.estimatedFixedTokens,
		).toBe(toolsCost);
		expect(withDefinitions.contextProfile.maxOutputTokens).toBe(profile.maxOutputTokens);
	});

	test('exact equality fits and one more reserved output token rejects optional retrieved context', () => {
		const old = turn('old');
		const previous = turn('previous');
		const active = [user('active')];
		const mandatory = compile([active]);
		const profile = exactBudgetProfile(
			mandatory.diagnostics.estimatedInputTokens + cost([...previous, ...old]),
		);
		const exact = compile([old, previous, active], semantic([candidate('old')]), profile);
		const tighter = compile([old, previous, active], semantic([candidate('old')]), {
			...profile,
			maxOutputTokens: profile.maxOutputTokens + 1,
		});
		expect(exact.messages.slice(1)).toEqual([...old, ...previous, ...active]);
		expect(exact.diagnostics.estimatedRemainingMarginTokens).toBe(0);
		expect(tighter.messages.slice(1)).toEqual([...previous, ...active]);
		expect(tighter.diagnostics).toMatchObject({
			retrievedTurnCount: 0,
			skippedOversizedCandidates: 1,
		});
	});

	test('active mandatory overflow still fails unchanged before optional candidates are selected', () => {
		const old = turn('old');
		const previous = turn('previous');
		const active = [user('active', 'a'.repeat(100_000))];
		try {
			compile([old, previous, active], semantic([candidate('old')]));
			throw new Error('Expected mandatory overflow');
		} catch (error) {
			expect(error).toBeInstanceOf(ContextBudgetExceededError);
			const overflow = error as ContextBudgetExceededError;
			expect(overflow.diagnostics).toMatchObject({
				maxOutputTokens: 4_096,
				safetyAllowanceTokens: 1_024,
				selectedCompletedTurns: 0,
				retrievedTurnCount: 0,
				retrievedEstimatedTokens: 0,
				skippedOversizedCandidates: 0,
			});
			expect(overflow.diagnostics.estimatedRemainingMarginTokens).toBeLessThan(0);
		}
	});

	test('retrieved read/search/edit failure/recovery chains remain exact and ordered', () => {
		const old: ModelMessage[] = [
			user('old', 'Inspect and update migration.'),
			{
				role: 'assistant',
				content: 'Inspect files.',
				toolCalls: [
					{ id: asToolCallId('search'), name: 'search_text', arguments: { query: 'migration' } },
					{ id: asToolCallId('read'), name: 'read_file', arguments: { path: 'src/db.ts' } },
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('search'),
				toolName: 'search_text',
				content: JSON.stringify({
					matches: [{ path: 'src/db.ts', line: 2, excerpt: 'migrate()' }],
				}),
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('read'),
				toolName: 'read_file',
				content: JSON.stringify({
					path: 'src/db.ts',
					content: 'historical exact source',
					version: 'old-version',
				}),
			},
			{
				role: 'assistant',
				content: 'Edit file.',
				toolCalls: [
					{
						id: asToolCallId('edit'),
						name: 'edit_file',
						arguments: { path: 'src/db.ts', edits: [{ oldText: 'old', newText: 'new' }] },
					},
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('edit'),
				toolName: 'edit_file',
				content: '{"error":{"message":"File changed; read again."}}',
			},
			{
				role: 'assistant',
				content: 'Read current file again.',
				toolCalls: [
					{ id: asToolCallId('reread'), name: 'read_file', arguments: { path: 'src/db.ts' } },
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('reread'),
				toolName: 'read_file',
				content: 'later exact source',
			},
			assistant('Recovered and inspected current state.'),
		];
		const previous = turn('previous');
		const active = [user('active')];
		const before = structuredClone(old);
		const compiled = compile([old, previous, active], semantic([candidate('old')]));
		expect(compiled.messages.slice(1)).toEqual([...before, ...previous, ...active]);
		for (const [index, message] of old.entries())
			expect(compiled.messages[index + 1]).toBe(message);
		expect(old).toEqual(before);
		expect(compiled.diagnostics.retrievedEstimatedTokens).toBe(cost(old));
	});

	test('historical file observations remain exact and earlier than authoritative active workspace reads', () => {
		const readTurn = (id: string, content: string): ModelMessage[] => [
			user(id, 'Inspect src/database.ts'),
			{
				role: 'assistant',
				content: 'Reading current workspace',
				toolCalls: [
					{ id: asToolCallId(id), name: 'read_file', arguments: { path: 'src/database.ts' } },
				],
			},
			{ role: 'tool', toolCallId: asToolCallId(id), toolName: 'read_file', content },
		];
		const historical = [
			...readTurn('old', 'engine=sqlite; HISTORICAL_ONLY'),
			assistant('Observed SQLite then.'),
		];
		const active = readTurn('active', 'engine=postgresql; CURRENT_WORKSPACE_TRUTH');
		const previous = turn('previous');
		const compiled = compile([historical, previous, active], semantic([candidate('old')]));
		expect(compiled.messages.slice(1)).toEqual([...historical, ...previous, ...active]);
		expect(
			compiled.messages
				.filter((message) => message.role === 'tool')
				.map((message) => message.content),
		).toEqual(['engine=sqlite; HISTORICAL_ONLY', 'engine=postgresql; CURRENT_WORKSPACE_TRUTH']);
		expect(compiled.messages.at(-1)).toBe(active.at(-1)!);
	});

	test('malformed old tool units and leading legacy groups are never semantically inserted', () => {
		const legacy = [assistant('Leading legacy')];
		const orphan: ModelMessage[] = [
			user('orphan'),
			{
				role: 'tool',
				toolCallId: asToolCallId('missing'),
				toolName: 'read_file',
				content: 'orphan body',
			},
		];
		const incomplete: ModelMessage[] = [
			user('incomplete'),
			{
				role: 'assistant',
				content: 'Unresolved',
				toolCalls: [{ id: asToolCallId('pending'), name: 'read_file', arguments: {} }],
			},
		];
		const wrongName: ModelMessage[] = [
			user('wrong-name'),
			{
				role: 'assistant',
				content: '',
				toolCalls: [{ id: asToolCallId('call'), name: 'read_file', arguments: {} }],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('call'),
				toolName: 'edit_file',
				content: 'wrong result',
			},
		];
		const previous = turn('previous');
		const active = [user('active')];
		const compiled = compile(
			[legacy, orphan, incomplete, wrongName, previous, active],
			semantic([candidate('orphan'), candidate('incomplete'), candidate('wrong-name')]),
		);
		expect(compiled.messages.slice(1)).toEqual([...previous, ...active]);
		expect(compiled.diagnostics).toMatchObject({ retrievedTurnCount: 0, droppedCompletedTurns: 4 });
	});

	test('long durable canonical history remains complete while semantic request is sparse', () => {
		const old = Array.from({ length: 200 }, (_, index) =>
			turn(`turn-${index}`, `Historical request ${index}: ${'x'.repeat(100)}`),
		);
		const active = [user('active', 'Database migration question.')];
		const history = [...old, active].flat();
		const before = structuredClone(history);
		const compiled = new ContextBuilder({
			systemPrompt,
			contextProfile: TEST_CONTEXT_PROFILE,
		}).build(
			{ sessionId: asSessionId('selected-session'), messages: history },
			tools,
			semantic([candidate('turn-2'), candidate('turn-75')], 199),
		);
		expect(compiled.messages.slice(1)).toEqual([...old[2]!, ...old[75]!, ...old[199]!, ...active]);
		expect(history).toEqual(before);
		expect(history).toHaveLength(401);
		expect(compiled.messages).toHaveLength(8);
		expect(compiled.diagnostics).toMatchObject({
			retrievedTurnCount: 2,
			selectedCompletedTurns: 3,
			droppedCompletedTurns: 197,
			historicalCandidatesConsidered: 199,
		});
		expect(compiled.diagnostics.estimatedInputTokens).toBeLessThan(11_264);
	});
});

describe('retrieval unavailable Phase 16 fallback', () => {
	for (const reason of ['disabled', 'embedding-failed', 'index-write-failed', 'timeout'] as const) {
		test(`${reason} retains safe Phase 16 contiguous recent history`, () => {
			const old = turn('old');
			const middle = turn('middle');
			const previous = turn('previous');
			const active = [user('active')];
			const retrieval: HistoryRetrieval = {
				enabled: reason !== 'disabled',
				candidates: [],
				candidatesConsidered: 0,
				fallbackReason: reason,
			};
			const compiled = compile([old, middle, previous, active], retrieval);
			expect(compiled.messages.slice(1)).toEqual([...old, ...middle, ...previous, ...active]);
			expect(compiled.diagnostics).toMatchObject({
				retrievalFallbackReason: reason,
				retrievalEnabled: reason !== 'disabled',
				retrievedTurnCount: 0,
				retrievedEstimatedTokens: 0,
				selectedCompletedTurns: 3,
			});
		});
	}

	test('fallback stops at first oversized older turn instead of skipping to an older small turn', () => {
		const old = turn('old');
		const oversized = turn('oversized', 'x'.repeat(100_000));
		const previous = turn('previous');
		const active = [user('active')];
		const compiled = compile([old, oversized, previous, active], {
			enabled: true,
			candidates: [candidate('old')],
			candidatesConsidered: 1,
			fallbackReason: 'embedding-failed',
		});
		expect(compiled.messages.slice(1)).toEqual([...previous, ...active]);
		expect(compiled.diagnostics).toMatchObject({
			retrievedTurnCount: 0,
			skippedOversizedCandidates: 0,
			selectedCompletedTurns: 1,
			droppedCompletedTurns: 2,
		});
	});

	test('fallback never truncates or admits an overflowing mandatory active turn', () => {
		expect(() =>
			compile([turn('previous'), [user('active', 'x'.repeat(100_000))]], {
				enabled: false,
				candidates: [],
				candidatesConsidered: 0,
				fallbackReason: 'disabled',
			}),
		).toThrow(ContextBudgetExceededError);
	});
});
