import { describe, expect, test } from 'bun:test';

import type { AgentEvent } from '@/domain/AgentEvent';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	type EventId,
	type ISODateTime,
	type MessageId,
	type SessionId,
	type ToolCallId,
} from '@/domain/Ids';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type { ModelChatInput, ModelPort, ModelStreamChunk } from '../ports/ModelPort';
import type { SessionStorePort } from '../ports/SessionStorePort';
import { ContextBuilder } from '../services/ContextBuilder';
import { RunAgentTurn } from './RunAgentTurn';

class InMemorySessionStore implements SessionStorePort {
	readonly events: AgentEvent[] = [];

	async readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		return this.events.filter((event) => event.sessionId === sessionId);
	}

	async appendSessionEvent(event: AgentEvent): Promise<void> {
		this.events.push(event);
	}
}

class FakeModel implements ModelPort {
	receivedInput: ModelChatInput | null = null;

	async *streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		this.receivedInput = input;

		yield { contentDelta: 'Hello' };
		yield { contentDelta: ' there' };
	}
}

class FailingModel implements ModelPort {
	async *streamChat(): AsyncIterable<ModelStreamChunk> {
		throw new Error('model failed');
	}
}

class FixedClock implements ClockPort {
	now(): ISODateTime {
		return asISODateTime('2026-06-09T12:00:00.000Z');
	}
}

class SequenceIdGenerator implements IdGeneratorPort {
	private nextNumber = 1;

	nextEventId(): EventId {
		return asEventId(`event-${this.nextNumber++}`);
	}

	nextMessageId(): MessageId {
		return asMessageId(`message-${this.nextNumber++}`);
	}

	nextSessionId(): SessionId {
		return asSessionId(`session-${this.nextNumber++}`);
	}

	nextToolCallId(): ToolCallId {
		throw new Error('Not needed in this test.');
	}
}

describe('RunAgentTurn', () => {
	test('stores prompt, streams model chunks, and stores completed assistant message', async () => {
		const sessionStore = new InMemorySessionStore();
		const model = new FakeModel();
		const sessionId = asSessionId('session-1');
		const useCase = new RunAgentTurn({
			sessionStore,
			model,
			contextBuilder: new ContextBuilder({
				systemPrompt: 'You are a local coding agent.',
			}),
			clock: new FixedClock(),
			idGenerator: new SequenceIdGenerator(),
		});

		const chunks: ModelStreamChunk[] = [];

		for await (const chunk of useCase.run({ sessionId, prompt: 'Say hello' })) {
			chunks.push(chunk);
		}

		expect(chunks).toEqual([
			{ contentDelta: 'Hello' },
			{ contentDelta: ' there' },
		]);
		expect(model.receivedInput).toEqual({
			messages: [
				{
					role: 'system',
					content: 'You are a local coding agent.',
				},
				{
					id: asMessageId('message-2'),
					role: 'user',
					content: 'Say hello',
				},
			],
		});
		expect(sessionStore.events).toEqual([
			{
				id: asEventId('event-1'),
				messageId: asMessageId('message-2'),
				sessionId,
				prompt: 'Say hello',
				type: 'prompt.submitted',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
			},
			{
				id: asEventId('event-3'),
				messageId: asMessageId('message-4'),
				sessionId,
				type: 'assistant.message.completed',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				content: 'Hello there',
			},
		]);
	});

	test('rejects empty prompts before storing events', async () => {
		const sessionStore = new InMemorySessionStore();
		const useCase = new RunAgentTurn({
			sessionStore,
			model: new FakeModel(),
			contextBuilder: new ContextBuilder({
				systemPrompt: 'You are a local coding agent.',
			}),
			clock: new FixedClock(),
			idGenerator: new SequenceIdGenerator(),
		});

		await expect(
			collectTurn(useCase.run({ sessionId: asSessionId('session-1'), prompt: ' ' })),
		).rejects.toThrow('Prompt cannot be empty.');
		expect(sessionStore.events).toEqual([]);
	});

	test('stores agent error when model streaming fails', async () => {
		const sessionStore = new InMemorySessionStore();
		const sessionId = asSessionId('session-1');
		const useCase = new RunAgentTurn({
			sessionStore,
			model: new FailingModel(),
			contextBuilder: new ContextBuilder({
				systemPrompt: 'You are a local coding agent.',
			}),
			clock: new FixedClock(),
			idGenerator: new SequenceIdGenerator(),
		});

		await expect(
			collectTurn(useCase.run({ sessionId, prompt: 'Say hello' })),
		).rejects.toThrow('model failed');

		expect(sessionStore.events).toEqual([
			{
				id: asEventId('event-1'),
				messageId: asMessageId('message-2'),
				sessionId,
				prompt: 'Say hello',
				type: 'prompt.submitted',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
			},
			{
				id: asEventId('event-3'),
				sessionId,
				type: 'agent.error',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				error: {
					message: 'model failed',
					code: 'MODEL_STREAM_FAILED',
					recoverable: true,
					details: {
						name: 'Error',
					},
				},
			},
		]);
	});
});

const collectTurn = async (
	stream: AsyncIterable<ModelStreamChunk>,
): Promise<ModelStreamChunk[]> => {
	const chunks: ModelStreamChunk[] = [];

	for await (const chunk of stream) {
		chunks.push(chunk);
	}

	return chunks;
};
