import { describe, expect, test } from 'bun:test';

import { createInitialAgentState } from '@/domain/AgentState';
import { asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';

import { ContextBudgetExceededError, ContextBuilder } from './ContextBuilder';

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
