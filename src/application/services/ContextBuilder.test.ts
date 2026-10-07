import { describe, expect, test } from 'bun:test';

import { createInitialAgentState } from '@/domain/AgentState';
import { asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';

import { ContextBudgetExceededError, ContextBuilder } from './ContextBuilder';

// Deliberately serialize complete candidate arrays, as fit did before Phase 8.
// Do not use production grouping or sizing helpers in this correctness oracle.
const referenceFit = (messages: ModelMessage[], budget: number): ModelMessage[] => {
	const systems: ModelMessage[] = [];
	const turns: ModelMessage[][] = [];
	for (const message of messages) {
		if (message.role === 'system') {
			systems.push(message);
		} else if (message.role === 'user' || turns.length === 0) {
			turns.push([message]);
		} else {
			turns[turns.length - 1]!.push(message);
		}
	}

	let selected = [...systems, ...(turns.at(-1) ?? [])];
	if (JSON.stringify(selected).length > budget) {
		throw new ContextBudgetExceededError(budget);
	}
	for (let index = turns.length - 2; index >= 0; index -= 1) {
		const candidate = [...systems, ...turns.slice(index).flat()];
		if (JSON.stringify(candidate).length > budget) break;
		selected = candidate;
	}
	return selected;
};

const fitOutcome = (fit: () => ModelMessage[]) => {
	try {
		return { messages: fit() };
	} catch (error) {
		if (!(error instanceof ContextBudgetExceededError)) throw error;
		return { errorClass: error.constructor, name: error.name, message: error.message };
	}
};

const user = (id: string, content: string): ModelMessage => ({
	role: 'user',
	id: asMessageId(id),
	content,
});

const systems: ModelMessage[] = [
	{ role: 'system', content: 'system one', id: asMessageId('system-1') },
	{ role: 'system', content: 'system two' },
];
const current = user('current', 'Current prompt');
const shortTurn: ModelMessage[] = [
	user('older-user', 'Older question'),
	{ role: 'assistant', id: asMessageId('older-answer'), content: 'Older answer' },
];
const escapedTurn: ModelMessage[] = [
	user('escaped-"\\-id', '"quoted" \\ newline\n tab\t {"looks":"like JSON"}'),
	{ role: 'assistant', content: 'path\\file\n"answer"\t' },
];
const unicodeTurn: ModelMessage[] = [
	user('unicode-😀', 'Zażółć gęślą jaźń — 日本語 😀 𝄞 e\u0301'),
	{ role: 'assistant', content: '🚀\ud800' },
];
const toolTurn: ModelMessage[] = [
	user('tool-user', 'Inspect files'),
	{
		role: 'assistant',
		id: asMessageId('tool-assistant'),
		content: 'Checking "files"\n',
		toolCalls: [
			{
				id: asToolCallId('call-"read"-😀'),
				name: 'read_file',
				arguments: { path: 'src/quoted"file.ts', startOffset: 0, endLine: 20 },
			},
			{
				id: asToolCallId('call-search'),
				name: 'search_file',
				arguments: { query: 'a\\b\n\t', options: { caseSensitive: false, limit: 10 } },
			},
			{
				id: asToolCallId('call-reference'),
				name: 'list_files',
				arguments: { path: '.', recursive: true },
			},
		],
	},
	{
		role: 'tool',
		id: asMessageId('read-result'),
		toolCallId: asToolCallId('call-"read"-😀'),
		toolName: 'read_file',
		content: JSON.stringify({
			path: 'src/quoted"file.ts',
			content: '"result"\\\n\t😀',
			startLine: 1,
			endLine: 10,
			truncated: true,
			nextRead: { path: 'src/quoted"file.ts', startOffset: 200, endLine: 20 },
		}),
	},
	{
		role: 'tool',
		toolCallId: asToolCallId('call-search'),
		toolName: 'search_file',
		content: JSON.stringify({ error: { code: 'TOOL_FAILED', message: 'Cannot read "path"\n' } }),
	},
	{
		role: 'tool',
		toolCallId: asToolCallId('call-reference'),
		toolName: 'list_files',
		content: JSON.stringify({
			cached: true,
			sourceToolCallId: 'original-list-id',
			message: 'Reusing the original successful result.',
		}),
	},
	{ role: 'assistant', content: 'Finished inspecting.' },
];

describe('ContextBuilder', () => {
	test('builds context with a system prompt for an empty state', () => {
		const state = createInitialAgentState(asSessionId('session-1'));
		const builder = new ContextBuilder({
			systemPrompt: 'You are a local coding agent.',
		});

		const context = builder.build(state);

		expect(context.messages).toEqual([
			{
				role: 'system',
				content: 'You are a local coding agent.',
			},
		]);
	});

	test('preserves session messages after the system prompt', () => {
		const state = createInitialAgentState(asSessionId('session-1'));
		const toolCallId = asToolCallId('tool-call-1');

		state.messages.push(
			{
				id: asMessageId('message-1'),
				role: 'user',
				content: 'Read README',
			},
			{
				id: asMessageId('message-2'),
				role: 'assistant',
				content: 'I will read it.',
			},
			{
				role: 'tool',
				toolCallId,
				toolName: 'read_file',
				content: 'README content',
			},
		);

		const builder = new ContextBuilder({
			systemPrompt: 'You are a local coding agent.',
		});

		const context = builder.build(state);

		expect(context.messages).toEqual([
			{
				role: 'system',
				content: 'You are a local coding agent.',
			},
			{
				id: asMessageId('message-1'),
				role: 'user',
				content: 'Read README',
			},
			{
				id: asMessageId('message-2'),
				role: 'assistant',
				content: 'I will read it.',
			},
			{
				role: 'tool',
				toolCallId,
				toolName: 'read_file',
				content: 'README content',
			},
		]);
	});

	test('keeps the current turn and newest complete turns within the budget', () => {
		const state = createInitialAgentState(asSessionId('session-1'));
		const oldContent = 'o'.repeat(160);
		const recentContent = 'r'.repeat(40);

		state.messages.push(
			{ id: asMessageId('message-1'), role: 'user', content: oldContent },
			{ id: asMessageId('message-2'), role: 'assistant', content: oldContent },
			{ id: asMessageId('message-3'), role: 'user', content: recentContent },
			{ id: asMessageId('message-4'), role: 'assistant', content: recentContent },
			{ id: asMessageId('message-5'), role: 'user', content: 'current prompt' },
		);

		const context = new ContextBuilder({
			systemPrompt: 'system',
			maxContextCharacters: 500,
		}).build(state);

		expect(context.messages).toEqual([
			{ role: 'system', content: 'system' },
			{ id: asMessageId('message-3'), role: 'user', content: recentContent },
			{ id: asMessageId('message-4'), role: 'assistant', content: recentContent },
			{ id: asMessageId('message-5'), role: 'user', content: 'current prompt' },
		]);
		expect(JSON.stringify(context.messages).length).toBeLessThanOrEqual(500);
	});

	test('drops a whole older turn instead of separating tool calls from results', () => {
		const state = createInitialAgentState(asSessionId('session-1'));
		const toolCallId = asToolCallId('tool-call-1');

		state.messages.push(
			{ id: asMessageId('message-1'), role: 'user', content: 'old prompt' },
			{
				id: asMessageId('message-2'),
				role: 'assistant',
				content: '',
				toolCalls: [{ id: toolCallId, name: 'read_file', arguments: { path: 'large.txt' } }],
			},
			{
				role: 'tool',
				toolCallId,
				toolName: 'read_file',
				content: 'x'.repeat(500),
			},
			{ id: asMessageId('message-3'), role: 'assistant', content: 'old answer' },
			{ id: asMessageId('message-4'), role: 'user', content: 'current prompt' },
		);

		const context = new ContextBuilder({
			systemPrompt: 'system',
			maxContextCharacters: 300,
		}).build(state);

		expect(context.messages).toEqual([
			{ role: 'system', content: 'system' },
			{ id: asMessageId('message-4'), role: 'user', content: 'current prompt' },
		]);
	});

	test('rejects a current turn that exceeds the budget', () => {
		const builder = new ContextBuilder({
			systemPrompt: 'system',
			maxContextCharacters: 120,
		});

		expect(() => builder.assertPromptFits('x'.repeat(200), asMessageId('message-1'))).toThrow(
			ContextBudgetExceededError,
		);
	});
});

describe('ContextBuilder exact sizing', () => {
	test('fits empty history and system-only builds without assuming one system', () => {
		const builder = new ContextBuilder({ systemPrompt: '' });
		expect(builder.fit([])).toEqual([]);
		expect(JSON.stringify(builder.fit([])).length).toBe(2);
		expect(builder.fit(systems)).toEqual(systems);
		expect(builder.build(createInitialAgentState(asSessionId('empty'))).messages).toEqual([
			{ role: 'system', content: '' },
		]);
	});

	for (const [name, older] of [
		['short conversation', shortTurn],
		['escaping', escapedTurn],
		['Unicode', unicodeTurn],
		['tool calls, results, errors and references', toolTurn],
	] as const) {
		test(`retains the whole ${name} turn at exact fit and drops it one character over`, () => {
			const expected = [...systems, ...older, current];
			const exactSize = JSON.stringify(expected).length;
			const fit = (budget: number) =>
				new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget }).fit(expected);

			expect(fit(exactSize)).toEqual(expected);
			expect(JSON.stringify(fit(exactSize)).length).toBe(exactSize);
			expect(fit(exactSize)).toEqual(referenceFit(expected, exactSize));
			expect(fit(exactSize - 1)).toEqual([...systems, current]);
			expect(fit(exactSize - 1)).toEqual(referenceFit(expected, exactSize - 1));
		});
	}

	test('counts all commas between multiple systems, older turns and the current turn', () => {
		const older = [...shortTurn, ...escapedTurn];
		const currentTurn = [current, { role: 'assistant', content: 'Current answer' } as const];
		const expected = [...systems, ...older, ...currentTurn];
		const budget = JSON.stringify(expected).length;
		const builder = new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget });
		expect(builder.fit(expected)).toEqual(expected);
		expect(builder.fit(expected)).toEqual(referenceFit(expected, budget));
		expect(
			new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget - 1 }).fit(expected),
		).toEqual([...systems, ...escapedTurn, ...currentTurn]);
	});

	test('uses serialized UTF-16 length for astral characters and escaped lone surrogates', () => {
		const expected = [...systems, ...unicodeTurn, current];
		const serialized = JSON.stringify(expected);
		expect('😀'.length).toBe(2);
		expect(serialized).toContain('😀');
		expect(serialized).toContain('\\ud800');
		const builder = new ContextBuilder({
			systemPrompt: '',
			maxContextCharacters: serialized.length,
		});
		expect(builder.fit(expected)).toEqual(referenceFit(expected, serialized.length));
		expect(builder.fit(expected)).toEqual(expected);
	});

	test('does not skip an oversized newest older turn to retain a smaller oldest turn', () => {
		const largeTurn = [
			user('large', 'x'.repeat(800)),
			{ role: 'assistant', content: 'large' } as const,
		];
		const messages = [...systems, ...shortTurn, ...largeTurn, current];
		const budget = JSON.stringify([...systems, ...shortTurn, current]).length;
		const builder = new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget });
		expect(builder.fit(messages)).toEqual([...systems, current]);
		expect(builder.fit(messages)).toEqual(referenceFit(messages, budget));
	});

	for (const [name, mandatory] of [
		['system-only context', systems],
		['system and current turn', [...systems, current]],
		['current turn without systems', [user('no-system', 'x'.repeat(80))]],
		['current tool turn', [...systems, ...toolTurn]],
	] as const) {
		test(`preserves the exact-fit and overflow error for mandatory ${name}`, () => {
			const exactSize = JSON.stringify(mandatory).length;
			const exact = new ContextBuilder({ systemPrompt: '', maxContextCharacters: exactSize });
			expect(exact.fit([...mandatory])).toEqual([...mandatory]);
			const budget = exactSize - 1;
			const builder = new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget });
			expect(() => builder.fit([...mandatory])).toThrow(ContextBudgetExceededError);
			expect(fitOutcome(() => builder.fit([...mandatory]))).toEqual({
				errorClass: ContextBudgetExceededError,
				name: 'ContextBudgetExceededError',
				message: `Current turn exceeds the model context budget of ${budget} characters.`,
			});
			expect(fitOutcome(() => builder.fit([...mandatory]))).toEqual(
				fitOutcome(() => referenceFit([...mandatory], budget)),
			);
		});
	}

	test('preserves constructor and prompt-preflight budget boundaries', () => {
		const systemPrompt = 'Required system "prompt"\n😀';
		const system = { role: 'system', content: systemPrompt } as const;
		const systemSize = JSON.stringify([system]).length;
		expect(
			new ContextBuilder({ systemPrompt, maxContextCharacters: systemSize }).fit([system]),
		).toEqual([system]);
		expect(
			() => new ContextBuilder({ systemPrompt, maxContextCharacters: systemSize - 1 }),
		).toThrow(new ContextBudgetExceededError(systemSize - 1));
		const prompt = 'Required user "prompt"\t\\😀';
		const messageId = asMessageId('preflight-id');
		const expected = [system, user(messageId, prompt)];
		const budget = JSON.stringify(expected).length;
		const builder = new ContextBuilder({ systemPrompt, maxContextCharacters: budget });
		expect(() => builder.assertPromptFits(prompt, messageId)).not.toThrow();
		const state = createInitialAgentState(asSessionId('preflight'));
		state.messages.push(user(messageId, prompt));
		expect(builder.build(state).messages).toEqual(expected);
		const tooSmall = new ContextBuilder({ systemPrompt, maxContextCharacters: budget - 1 });
		expect(() => tooSmall.assertPromptFits(prompt, messageId)).toThrow(
			new ContextBudgetExceededError(budget - 1),
		);
		expect(() => tooSmall.build(state)).toThrow(new ContextBudgetExceededError(budget - 1));
	});

	test('preserves separate invalid-budget errors', () => {
		for (const budget of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget })).toThrow(
				'Model context character budget must be a positive integer.',
			);
		}
	});
});

describe('ContextBuilder reference equivalence', () => {
	const histories: { name: string; messages: ModelMessage[] }[] = [
		{ name: 'empty', messages: [] },
		{ name: 'multiple systems only', messages: systems },
		{ name: 'systems and current only', messages: [...systems, current] },
		{ name: 'short conversation', messages: [...systems, ...shortTurn, current] },
		{
			name: 'many older turns',
			messages: [
				...systems,
				...Array.from({ length: 12 }, (_, index) => [
					user(`old-${index}`, 'question'.repeat(index + 1)),
					{ role: 'assistant', content: `answer ${index}` } as const,
				]).flat(),
				current,
			],
		},
		{
			name: 'large newest older turn',
			messages: [...systems, ...shortTurn, user('large-newest', 'x'.repeat(900)), current],
		},
		{
			name: 'large oldest turn',
			messages: [...systems, user('large-oldest', 'x'.repeat(900)), ...shortTurn, current],
		},
		{ name: 'tool-heavy', messages: [...systems, ...shortTurn, ...toolTurn, current] },
		{ name: 'escaping', messages: [...systems, ...escapedTurn, current] },
		{ name: 'Unicode', messages: [...systems, ...unicodeTurn, current] },
		{
			name: 'leading tool and assistant, interleaved systems, consecutive users',
			messages: [
				toolTurn[2]!,
				{ role: 'assistant', content: 'Leading answer' },
				systems[0]!,
				user('first', 'first'),
				systems[1]!,
				user('second', 'second'),
				{
					role: 'tool',
					toolCallId: asToolCallId('incomplete'),
					toolName: 'read_file',
					content: 'orphan',
				},
			],
		},
		{ name: 'no systems', messages: [...shortTurn, ...escapedTurn, current] },
	];

	for (const { name, messages } of histories) {
		test(`matches the direct JSON reference across budgets for ${name}`, () => {
			const injectedSystem = { role: 'system', content: '' } as const;
			const minimumBudget = JSON.stringify([injectedSystem]).length;
			const budgets = new Set([minimumBudget, 120_000]);
			const systemMessages = messages.filter((message) => message.role === 'system');
			const conversation = messages.filter((message) => message.role !== 'system');
			// Include both sides of every suffix-size boundary, including mandatory-only.
			for (let start = 0; start <= conversation.length; start += 1) {
				for (const prefix of [systemMessages, [injectedSystem, ...systemMessages]]) {
					const exactSize = JSON.stringify([...prefix, ...conversation.slice(start)]).length;
					for (const budget of [exactSize - 1, exactSize, exactSize + 1]) {
						if (budget >= minimumBudget) budgets.add(budget);
					}
				}
			}
			const state = createInitialAgentState(asSessionId('reference'));
			state.messages.push(...messages);
			for (const budget of budgets) {
				const builder = new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget });
				expect(fitOutcome(() => builder.fit(messages))).toEqual(
					fitOutcome(() => referenceFit(messages, budget)),
				);
				expect(fitOutcome(() => builder.build(state).messages)).toEqual(
					fitOutcome(() => referenceFit([injectedSystem, ...messages], budget)),
				);
			}
		});
	}
});

describe('ContextBuilder serialization count', () => {
	// Reading an enumerable content getter observes JSON serialization without
	// replacing global JSON.stringify or adding production instrumentation.
	const observeSerialization = (messages: ModelMessage[]) => {
		const counts = messages.map(() => 0);
		const observed = messages.map((message, index) => ({
			...message,
			get content() {
				counts[index] = counts[index]! + 1;
				return message.content;
			},
		}));
		return { observed, counts };
	};

	test('serializes every candidate message once while growing through several whole turns', () => {
		const messages = [...systems, ...shortTurn, ...escapedTurn, ...toolTurn, current];
		const { observed, counts } = observeSerialization(messages);
		const builder = new ContextBuilder({ systemPrompt: '' });
		const selected = builder.fit(observed);
		expect([...counts]).toEqual(messages.map(() => 1));
		expect(selected).toEqual(messages);
	});

	test('serializes a rejected turn once and stops before unconsidered older turns', () => {
		const messages = [
			...systems,
			...shortTurn,
			user('oversized', 'x'.repeat(900)),
			...escapedTurn,
			current,
		];
		const budget = JSON.stringify([...systems, ...escapedTurn, current]).length;
		const { observed, counts } = observeSerialization(messages);
		const selected = new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget }).fit(
			observed,
		);
		expect([...counts]).toEqual([1, 1, 0, 0, 1, 1, 1, 1]);
		expect(selected).toEqual([...systems, ...escapedTurn, current]);
	});

	test('does not size optional turns after mandatory overflow', () => {
		const messages = [...systems, ...shortTurn, current];
		const budget = JSON.stringify([...systems, current]).length - 1;
		const { observed, counts } = observeSerialization(messages);
		expect(() =>
			new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget }).fit(observed),
		).toThrow(ContextBudgetExceededError);
		expect([...counts]).toEqual([1, 1, 0, 0, 1]);
	});

	test('recomputes sizes on each fit after messages change', () => {
		const messages = [
			...systems.map((message) => ({ ...message })),
			...shortTurn.map((message) => ({ ...message })),
			{ ...current },
		];
		const budget = JSON.stringify(messages).length;
		const { observed, counts } = observeSerialization(messages);
		const builder = new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget });
		const first = builder.fit(observed);
		expect([...counts]).toEqual([1, 1, 1, 1, 1]);
		expect(first).toHaveLength(messages.length);
		// Change the same system/current objects between fits: persistent cached
		// lengths would incorrectly retain the older turn on the second call.
		messages[0]!.content += 'system grew';
		messages.at(-1)!.content += 'current grew';
		const second = builder.fit(observed);
		expect([...counts]).toEqual([2, 2, 2, 2, 2]);
		expect(second.map((message) => message.role)).toEqual(['system', 'system', 'user']);
		expect(second).toEqual(referenceFit(messages, budget));
	});

	test('serializes a repeated message object once but counts each array occurrence', () => {
		const message = user('shared', 'Shared message');
		const { observed, counts } = observeSerialization([message]);
		const repeated = [observed[0]!, observed[0]!];
		const budget = JSON.stringify([message, message]).length;
		const selected = new ContextBuilder({ systemPrompt: '', maxContextCharacters: budget }).fit(
			repeated,
		);
		expect([...counts]).toEqual([1]);
		expect(selected).toEqual([message, message]);
	});
});
