import { describe, expect, test } from 'bun:test';
import type { AgentEvent } from '@/domain/AgentEvent';
import { asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall } from '@/domain/Tool';
import {
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
	toolCallFailedEvent,
} from '@/test-support/AgentEventFixtures';
import {
	groupMessagesIntoTurns,
	HISTORY_TEXT_LIMIT,
	historyQuery,
	isRetrievableTurn,
	projectHistoryTurn,
} from './HistoryTurns';
import { reduceAgentState } from './SessionReducer';

const user = (id: string, content = id): ModelMessage => ({
	role: 'user',
	id: asMessageId(id),
	content,
});
const assistant = (content: string, calls?: ModelToolCall[]): ModelMessage => ({
	role: 'assistant',
	content,
	...(calls === undefined ? {} : { toolCalls: calls }),
});
const call = (
	id: string,
	name = 'read_file',
	args: unknown = { path: 'src/db.ts' },
): ModelToolCall => ({
	id: asToolCallId(id),
	name,
	arguments: args,
});
const result = (id: string, name = 'read_file', content = 'historical result'): ModelMessage => ({
	role: 'tool',
	toolCallId: asToolCallId(id),
	toolName: name,
	content,
});

describe('shared canonical history turns', () => {
	test('empty history has no groups', () => {
		expect(groupMessagesIntoTurns([])).toEqual([]);
	});

	test('user boundaries retain leading legacy messages and consecutive prompts unchanged', () => {
		const legacy = [assistant('Legacy explanation'), result('legacy')];
		const first = user('first');
		const second = user('second');
		const answer = assistant('Answer');
		const active = user('active');
		const messages = [...legacy, first, second, answer, active];
		const before = structuredClone(messages);
		const turns = groupMessagesIntoTurns(messages);
		expect(turns).toEqual([legacy, [first], [second, answer], [active]]);
		expect(turns.flat()).toEqual(before);
		expect(messages).toEqual(before);
		for (const [index, message] of turns.flat().entries()) expect(message).toBe(messages[index]!);
	});

	test('a complete multi-tool chain and continuation stay in one user turn', () => {
		const turn = [
			user('inspect'),
			assistant('Inspect files', [
				call('read'),
				call('search', 'search_text', { query: 'migration' }),
			]),
			result('read'),
			result('search', 'search_text'),
			assistant('The migration uses PostgreSQL.'),
		];
		expect(groupMessagesIntoTurns([...turn, user('next')])).toEqual([turn, [user('next')]]);
		expect(isRetrievableTurn(turn)).toBe(true);
	});

	test('system instructions are rejected at every canonical position', () => {
		for (const messages of [
			[{ role: 'system', content: 'hidden' }],
			[user('first'), { role: 'system', content: 'hidden' }, user('active')],
		] satisfies ModelMessage[][]) {
			expect(() => groupMessagesIntoTurns(messages)).toThrow(
				'must not contain system instructions',
			);
		}
	});

	test('durable user identity survives replay and does not depend on group position', () => {
		const sessionId = asSessionId('stable-session');
		const messageId = asMessageId('durable-user-id');
		const events: AgentEvent[] = [
			promptSubmittedEvent({ sessionId, messageId, prompt: 'Use PostgreSQL for this project.' }),
			assistantMessageCompletedEvent({ sessionId, content: 'PostgreSQL selected.' }),
			promptSubmittedEvent({ sessionId, messageId: asMessageId('active'), prompt: 'Migration?' }),
		];
		const live = reduceAgentState(sessionId, events);
		const replay = reduceAgentState(sessionId, JSON.parse(JSON.stringify(events)) as AgentEvent[]);
		const original = groupMessagesIntoTurns(live.messages)[0]!;
		const resumed = groupMessagesIntoTurns(replay.messages)[0]!;
		const shifted = groupMessagesIntoTurns([assistant('Legacy group'), ...replay.messages])[1]!;
		expect(original[0]?.id).toBe(messageId);
		expect(resumed[0]?.id).toBe(messageId);
		expect(shifted[0]?.id).toBe(messageId);
		expect(resumed).toEqual(original);
	});

	test('reducer-produced read/search/edit failure and recovery remain one eligible exact unit', () => {
		const sessionId = asSessionId('tool-history');
		const events: AgentEvent[] = [
			promptSubmittedEvent({ sessionId, prompt: 'Inspect and fix database migration.' }),
			assistantToolCallsCompletedEvent({
				sessionId,
				content: 'Find the migration and inspect the file.',
				toolCalls: [
					{ ...call('search', 'search_text', { query: 'migrate' }), id: asToolCallId('search') },
					{ ...call('read'), id: asToolCallId('read') },
				],
			}),
			toolCallCompletedEvent({
				sessionId,
				toolCallId: asToolCallId('read'),
				output: 'old file text',
			}),
			toolCallCompletedEvent({
				sessionId,
				toolCallId: asToolCallId('search'),
				toolName: 'search_text',
				output: { matches: [{ path: 'src/db.ts', line: 2, excerpt: 'migrate()' }] },
			}),
			assistantToolCallsCompletedEvent({
				sessionId,
				toolCalls: [{ ...call('edit', 'edit_file'), id: asToolCallId('edit') }],
			}),
			toolCallFailedEvent({
				sessionId,
				toolCallId: asToolCallId('edit'),
				toolName: 'edit_file',
				error: { message: 'File changed; read it again.' },
			}),
			assistantToolCallsCompletedEvent({
				sessionId,
				content: 'Re-read current workspace after the stale edit.',
				toolCalls: [{ ...call('reread'), id: asToolCallId('reread') }],
			}),
			toolCallCompletedEvent({
				sessionId,
				toolCallId: asToolCallId('reread'),
				output: 'current file text',
			}),
			assistantMessageCompletedEvent({
				sessionId,
				content: 'The current file needs another edit.',
			}),
			promptSubmittedEvent({ sessionId, messageId: asMessageId('active'), prompt: 'Continue.' }),
		];
		const state = reduceAgentState(sessionId, events);
		const before = structuredClone(state.messages);
		const [historical, active] = groupMessagesIntoTurns(state.messages);
		expect(isRetrievableTurn(historical!)).toBe(true);
		expect(historical?.map((message) => message.role)).toEqual([
			'user',
			'assistant',
			'tool',
			'tool',
			'assistant',
			'tool',
			'assistant',
			'tool',
			'assistant',
		]);
		expect(
			historical?.filter((message) => message.role === 'tool').map((message) => message.content),
		).toEqual([
			JSON.stringify({ matches: [{ path: 'src/db.ts', line: 2, excerpt: 'migrate()' }] }),
			'old file text',
			JSON.stringify({ error: { message: 'File changed; read it again.' } }),
			'current file text',
		]);
		expect(active).toEqual([user('active', 'Continue.')]);
		projectHistoryTurn(historical!);
		expect(state.messages).toEqual(before);
	});

	test('a prior prompt without clean final answer can still be a safe historical turn', () => {
		expect(isRetrievableTurn([user('interrupted')])).toBe(true);
		expect(
			isRetrievableTurn([
				user('failed'),
				assistant('', [call('failed')]),
				result('failed', 'read_file', '{"error":{"message":"not found"}}'),
			]),
		).toBe(true);
	});
});

describe('retrieval chain eligibility', () => {
	const invalid: { name: string; turn: ModelMessage[] }[] = [
		{ name: 'empty turn', turn: [] },
		{ name: 'leading assistant legacy group', turn: [assistant('Legacy')] },
		{ name: 'leading orphan result', turn: [result('orphan')] },
		{ name: 'orphan result after user', turn: [user('old'), result('orphan')] },
		{ name: 'missing result', turn: [user('old'), assistant('', [call('unresolved')])] },
		{
			name: 'duplicate call in batch',
			turn: [user('old'), assistant('', [call('same'), call('same')]), result('same')],
		},
		{
			name: 'duplicate call across batches',
			turn: [
				user('old'),
				assistant('', [call('same')]),
				result('same'),
				assistant('', [call('same')]),
				result('same'),
			],
		},
		{
			name: 'duplicate result',
			turn: [user('old'), assistant('', [call('same')]), result('same'), result('same')],
		},
		{
			name: 'unknown result id',
			turn: [user('old'), assistant('', [call('first')]), result('other')],
		},
		{
			name: 'mismatched result tool name',
			turn: [user('old'), assistant('', [call('first')]), result('first', 'edit_file')],
		},
		{
			name: 'missing call id',
			turn: [user('old'), assistant('', [{ name: 'read_file', arguments: {} }]), result('first')],
		},
		{ name: 'empty call id', turn: [user('old'), assistant('', [call('')]), result('')] },
		{
			name: 'empty call name',
			turn: [user('old'), assistant('', [call('first', '')]), result('first', '')],
		},
		{
			name: 'assistant continuation before results',
			turn: [user('old'), assistant('', [call('first')]), assistant('Premature'), result('first')],
		},
		{
			name: 'next tool batch before prior results',
			turn: [
				user('old'),
				assistant('', [call('first')]),
				assistant('', [call('second')]),
				result('first'),
				result('second'),
			],
		},
	];
	for (const { name, turn } of invalid) {
		test(`rejects ${name} without altering canonical messages`, () => {
			const before = structuredClone(turn);
			expect(isRetrievableTurn(turn)).toBe(false);
			expect(turn).toEqual(before);
		});
	}

	test('allows each complete unique tool batch followed by its continuation', () => {
		const turn = [
			user('old'),
			assistant('Read', [call('first')]),
			result('first'),
			assistant('Search', [call('second', 'search_text')]),
			result('second', 'search_text'),
			assistant('Done'),
		];
		expect(isRetrievableTurn(turn)).toBe(true);
	});
});

describe('bounded deterministic historical search projection', () => {
	test('retains natural conversation, tool names, paths, queries and line metadata', () => {
		const turn = [
			user('old', 'Investigate database migration.'),
			assistant('Inspect the migration.', [
				call('read', 'read_file', {
					path: 'src/db.ts',
					startLine: 12,
					endLine: 30,
					startOffset: 5,
				}),
				call('find', 'find_files', { path: 'src', pattern: '**/*.ts' }),
				call('search', 'search_text', { query: 'migrate' }),
				call('move', 'move_file', { source: 'old.ts', destination: 'new.ts' }),
			]),
		];
		expect(projectHistoryTurn(turn)).toBe(
			[
				'user: Investigate database migration.',
				'assistant: Inspect the migration.',
				'tool: read_file',
				'path: src/db.ts',
				'startLine: 12',
				'startOffset: 5',
				'endLine: 30',
				'tool: find_files',
				'path: src',
				'pattern: **/*.ts',
				'tool: search_text',
				'query: migrate',
				'tool: move_file',
				'source: old.ts',
				'destination: new.ts',
			].join('\n'),
		);
	});

	test('omits historical result bodies and mutation content while exact payload stays intact', () => {
		const secretBody = 'RAW_HISTORICAL_FILE_BODY'.repeat(2_000);
		const turn = [
			user('old', 'Update migration.'),
			assistant('Update the migration.', [
				call('read'),
				call('search', 'search_text', { query: 'schema' }),
				call('edit', 'edit_file', {
					path: 'src/db.ts',
					edits: [{ oldText: 'RAW_OLD_EDIT', newText: 'RAW_NEW_EDIT' }],
				}),
				call('replace', 'replace_file', {
					path: 'src/replace.ts',
					content: 'RAW_REPLACEMENT',
					expectedVersion: 'RAW_VERSION',
				}),
				call('create', 'create_file', { path: 'src/create.ts', content: 'RAW_CREATED' }),
			]),
			result('read', 'read_file', secretBody),
			result('search', 'search_text', 'RAW_SEARCH_EXCERPT'),
			result('edit', 'edit_file', 'RAW_EDIT_RESULT'),
			result('replace', 'replace_file'),
			result('create', 'create_file'),
		];
		const before = structuredClone(turn);
		const projection = projectHistoryTurn(turn);
		expect(projection).toContain('path: src/db.ts');
		expect(projection).toContain('tool: edit_file');
		expect(projection).toContain('query: schema');
		expect(projection).not.toContain('RAW_');
		expect(turn).toEqual(before);
		expect(turn[2]?.content).toBe(secretBody);
	});

	test('strips fenced code from user and assistant without generating replacement facts', () => {
		const turn = [
			user('old', 'Database choice.\n```sql\nDROP TABLE OLD_CODE;\n```\nUse PostgreSQL.'),
			assistant('Inspect migration.\n```ts\nconst HIDDEN_CODE = 1;\n```\nRe-read before edits.'),
		];
		expect(projectHistoryTurn(turn)).toBe(
			'user: Database choice.\n\nUse PostgreSQL.\nassistant: Inspect migration.\n\nRe-read before edits.',
		);
		expect(turn[0]?.content).toContain('OLD_CODE');
		expect(turn[1]?.content).toContain('HIDDEN_CODE');
	});

	test('unterminated fenced content is omitted deterministically', () => {
		expect(projectHistoryTurn([user('old', 'Keep explanation.\n```json\n{"HIDDEN":true}')])).toBe(
			'user: Keep explanation.\n',
		);
	});

	test('bounded field contributions and total prevent huge natural content or arguments dominating', () => {
		const turn = [
			user('old', 'u'.repeat(9_000)),
			assistant('a'.repeat(5_000), [
				call('read', 'read_file', { path: 'p'.repeat(2_000) }),
				call('search', 'search_text', { query: 'q'.repeat(2_000) }),
			]),
			...Array.from({ length: 20 }, () => assistant('x'.repeat(2_000))),
		];
		const text = projectHistoryTurn(turn);
		expect(text).toHaveLength(HISTORY_TEXT_LIMIT);
		expect(text).toContain(`user: ${'u'.repeat(4_000)}\nassistant:`);
		expect(text).not.toContain('u'.repeat(4_001));
		expect(text).toContain(`assistant: ${'a'.repeat(1_000)}\ntool:`);
		expect(text).not.toContain('a'.repeat(1_001));
		expect(text).toContain(`path: ${'p'.repeat(300)}\ntool:`);
		expect(text).not.toContain('p'.repeat(301));
		expect(text).toContain(`query: ${'q'.repeat(300)}\nassistant:`);
	});

	test('ignores nonobject arguments and nonfinite or unsupported metadata', () => {
		const turn = [
			user('old'),
			assistant('', [
				call('null', 'read_file', null),
				call('string', 'legacy_tool', 'RAW_STRING_ARGUMENT'),
				call('object', 'read_file', {
					path: { nested: 'RAW_NESTED' },
					query: ['RAW_ARRAY'],
					startLine: Infinity,
					startOffset: NaN,
					endLine: -2,
					unknown: 'RAW_UNKNOWN',
				}),
			]),
		];
		expect(projectHistoryTurn(turn)).toBe(
			'user: old\ntool: read_file\ntool: legacy_tool\ntool: read_file\nendLine: -2',
		);
	});

	test('same canonical payload has the same projection after durable-style cloning', () => {
		const turn = [
			user('old', 'Use PostgreSQL.'),
			assistant('Inspect', [call('read')]),
			result('read'),
			assistant('The table uses UUIDs.'),
		];
		expect(projectHistoryTurn(JSON.parse(JSON.stringify(turn)) as ModelMessage[])).toBe(
			projectHistoryTurn(turn),
		);
	});
});

describe('active retrieval query', () => {
	test('uses current user text only and ignores huge active tool outputs and continuations', () => {
		const turn = [
			user('active', 'How should migrations work?'),
			assistant('Inspecting', [call('read')]),
			result('read', 'read_file', 'RAW_CURRENT_SOURCE'.repeat(10_000)),
			assistant('Tool continuation'),
		];
		expect(historyQuery(turn)).toBe('How should migrations work?');
	});

	test('query is bounded and preserves exact current user prefix including code', () => {
		const content = '```sql\nSELECT 1;\n```\n' + 'q'.repeat(HISTORY_TEXT_LIMIT);
		expect(historyQuery([user('active', content)])).toBe(content.slice(0, HISTORY_TEXT_LIMIT));
		expect(historyQuery([user('active', content)])).toHaveLength(HISTORY_TEXT_LIMIT);
	});

	test('no user-started active turn yields no query', () => {
		expect(historyQuery([])).toBe('');
		expect(historyQuery([assistant('Legacy active group')])).toBe('');
	});
});
