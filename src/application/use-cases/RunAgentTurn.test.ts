import { describe, expect, test } from 'bun:test';

import type { AgentEvent } from '@/domain/AgentEvent';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	asToolCallId,
	type EventId,
	type ISODateTime,
	type MessageId,
	type SessionId,
	type ToolCallId,
} from '@/domain/Ids';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type {
	ModelChatInput,
	ModelChatResult,
	ModelPort,
	ModelStreamChunk,
} from '../ports/ModelPort';
import type {
	SessionStorePort,
	StoredSession,
} from '../ports/SessionStorePort';
import type {
	ToolExecutionRequest,
	ToolExecutionResult,
	ToolExecutorPort,
} from '../ports/ToolExecutorPort';
import { ContextBuilder } from '../services/ContextBuilder';
import { RunAgentTurn } from './RunAgentTurn';

class InMemorySessionStore implements SessionStorePort {
	readonly events: AgentEvent[] = [];

	async listSessions(): Promise<StoredSession[]> {
		return [];
	}

	async readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		return this.events.filter((event) => event.sessionId === sessionId);
	}

	async appendSessionEvent(event: AgentEvent): Promise<void> {
		this.events.push(event);
	}
}

class FakeModel implements ModelPort {
	receivedInput: ModelChatInput | null = null;

	async chat(input: ModelChatInput): Promise<ModelChatResult> {
		this.receivedInput = input;

		return {
			content: 'Hello there',
			toolCalls: [],
		};
	}

	async *streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		this.receivedInput = input;

		yield { contentDelta: 'Hello' };
		yield { contentDelta: ' there' };
	}
}

class FailingModel implements ModelPort {
	async chat(): Promise<ModelChatResult> {
		throw new Error('model failed');
	}

	async *streamChat(): AsyncIterable<ModelStreamChunk> {
		throw new Error('model failed');
	}
}

class ToolCallingModel implements ModelPort {
	readonly receivedInputs: ModelChatInput[] = [];

	async chat(input: ModelChatInput): Promise<ModelChatResult> {
		this.receivedInputs.push(input);

		if (this.receivedInputs.length === 1) {
			return {
				content: '',
				toolCalls: [
					{
						name: 'read_file',
						arguments: { path: 'README.md' },
					},
				],
			};
		}

		return {
			content: 'The file contains hello.',
			toolCalls: [],
		};
	}

	async *streamChat(): AsyncIterable<ModelStreamChunk> {
		throw new Error('streamChat should not be used in this test.');
	}
}

class FailingToolCallingModel implements ModelPort {
	private callCount = 0;

	async chat(): Promise<ModelChatResult> {
		this.callCount += 1;

		if (this.callCount > 1) {
			return {
				content: 'I could not read the file.',
				toolCalls: [],
			};
		}

		return {
			content: '',
			toolCalls: [
				{
					name: 'read_file',
					arguments: { path: 'missing.txt' },
				},
			],
		};
	}

	async *streamChat(): AsyncIterable<ModelStreamChunk> {
		throw new Error('streamChat should not be used in this test.');
	}
}

class SearchThenReadModel implements ModelPort {
	readonly receivedInputs: ModelChatInput[] = [];

	async chat(input: ModelChatInput): Promise<ModelChatResult> {
		this.receivedInputs.push(input);

		if (this.receivedInputs.length === 1) {
			return {
				content: '',
				toolCalls: [
					{
						name: 'search_file',
						arguments: { query: 'find_by_email' },
					},
				],
			};
		}

		if (this.receivedInputs.length === 2) {
			return {
				content: '',
				toolCalls: [
					{
						name: 'read_file',
						arguments: { path: 'src/users.py' },
					},
				],
			};
		}

		return {
			content: 'find_by_email compares lowercased emails.',
			toolCalls: [],
		};
	}

	async *streamChat(): AsyncIterable<ModelStreamChunk> {
		throw new Error('streamChat should not be used in this test.');
	}
}

class InfiniteToolCallingModel implements ModelPort {
	async chat(): Promise<ModelChatResult> {
		return {
			content: '',
			toolCalls: [
				{
					name: 'read_file',
					arguments: { path: 'README.md' },
				},
			],
		};
	}

	async *streamChat(): AsyncIterable<ModelStreamChunk> {
		throw new Error('streamChat should not be used in this test.');
	}
}

class FakeToolExecutor implements ToolExecutorPort {
	readonly receivedRequests: ToolExecutionRequest[] = [];

	listTools() {
		return [
			{
				name: 'read_file',
				description: 'Read a file',
				parameters: {
					type: 'object',
					required: ['path'],
					properties: {
						path: {
							type: 'string',
						},
					},
				},
			},
		];
	}

	async execute(
		request: ToolExecutionRequest,
	): Promise<ToolExecutionResult> {
		this.receivedRequests.push(request);

		return {
			toolName: request.toolName,
			output: {
				path: 'README.md',
				content: 'hello',
			},
		};
	}
}

class SearchReadToolExecutor implements ToolExecutorPort {
	readonly receivedRequests: ToolExecutionRequest[] = [];

	listTools() {
		return [
			{
				name: 'search_file',
				description: 'Search files',
				parameters: {
					type: 'object',
					required: ['query'],
					properties: {
						query: {
							type: 'string',
						},
					},
				},
			},
			{
				name: 'read_file',
				description: 'Read a file',
				parameters: {
					type: 'object',
					required: ['path'],
					properties: {
						path: {
							type: 'string',
						},
					},
				},
			},
		];
	}

	async execute(
		request: ToolExecutionRequest,
	): Promise<ToolExecutionResult> {
		this.receivedRequests.push(request);

		if (request.toolName === 'search_file') {
			return {
				toolName: request.toolName,
				output: {
					matches: [
						{
							path: 'src/users.py',
							line: 10,
							text: 'def find_by_email(self, email: str) -> User | None:',
						},
					],
				},
			};
		}

		return {
			toolName: request.toolName,
			output: {
				path: 'src/users.py',
				content: 'if user.email.lower() == email.lower():',
			},
		};
	}
}

class FailingToolExecutor implements ToolExecutorPort {
	listTools() {
		return [
			{
				name: 'read_file',
				description: 'Read a file',
				parameters: {
					type: 'object',
					required: ['path'],
					properties: {
						path: {
							type: 'string',
						},
					},
				},
			},
		];
	}

	async execute(): Promise<ToolExecutionResult> {
		throw new Error('file missing');
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
		return asToolCallId(`tool-call-${this.nextNumber++}`);
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

	test('executes one model tool call and stores the completed tool event', async () => {
		const sessionStore = new InMemorySessionStore();
		const model = new ToolCallingModel();
		const toolExecutor = new FakeToolExecutor();
		const sessionId = asSessionId('session-1');
		const useCase = new RunAgentTurn({
			sessionStore,
			model,
			contextBuilder: new ContextBuilder({
				systemPrompt: 'You are a local coding agent.',
			}),
			clock: new FixedClock(),
			idGenerator: new SequenceIdGenerator(),
			toolExecutor,
		});

		const chunks = await collectTurn(
			useCase.run({ sessionId, prompt: 'Read README' }),
		);

		expect(chunks).toEqual([
			{
				contentDelta: 'The file contains hello.',
			},
		]);
		expect(toolExecutor.receivedRequests).toEqual([
			{
				toolName: 'read_file',
				toolInput: { path: 'README.md' },
			},
		]);
		expect(model.receivedInputs).toEqual([
			{
				messages: [
					{
						role: 'system',
						content: 'You are a local coding agent.',
					},
					{
						id: asMessageId('message-2'),
						role: 'user',
						content: 'Read README',
					},
				],
				tools: [
					{
						name: 'read_file',
						description: 'Read a file',
						parameters: {
							type: 'object',
							required: ['path'],
							properties: {
								path: {
									type: 'string',
								},
							},
						},
					},
				],
			},
			{
				messages: [
					{
						role: 'system',
						content: 'You are a local coding agent.',
					},
					{
						id: asMessageId('message-2'),
						role: 'user',
						content: 'Read README',
					},
					{
						role: 'assistant',
						content: '',
						toolCalls: [
							{
								id: asToolCallId('tool-call-3'),
								name: 'read_file',
								arguments: { path: 'README.md' },
							},
						],
					},
					{
						role: 'tool',
						toolCallId: asToolCallId('tool-call-3'),
						toolName: 'read_file',
						content: '{"path":"README.md","content":"hello"}',
					},
				],
				tools: [
					{
						name: 'read_file',
						description: 'Read a file',
						parameters: {
							type: 'object',
							required: ['path'],
							properties: {
								path: {
									type: 'string',
								},
							},
						},
					},
				],
			},
		]);
		expect(sessionStore.events).toEqual([
			{
				id: asEventId('event-1'),
				messageId: asMessageId('message-2'),
				sessionId,
				prompt: 'Read README',
				type: 'prompt.submitted',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
			},
			{
				id: asEventId('event-4'),
				sessionId,
				type: 'tool.call.requested',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
				toolInput: { path: 'README.md' },
				approvalRequired: false,
			},
			{
				id: asEventId('event-5'),
				sessionId,
				type: 'tool.call.started',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
			},
			{
				id: asEventId('event-6'),
				sessionId,
				type: 'tool.call.completed',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
				output: {
					path: 'README.md',
					content: 'hello',
				},
			},
			{
				id: asEventId('event-7'),
				messageId: asMessageId('message-8'),
				sessionId,
				type: 'assistant.message.completed',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				content: 'The file contains hello.',
			},
		]);
	});

	test('allows the model to chain search and read tool calls before answering', async () => {
		const sessionStore = new InMemorySessionStore();
		const model = new SearchThenReadModel();
		const toolExecutor = new SearchReadToolExecutor();
		const sessionId = asSessionId('session-1');
		const useCase = new RunAgentTurn({
			sessionStore,
			model,
			contextBuilder: new ContextBuilder({
				systemPrompt: 'You are a local coding agent.',
			}),
			clock: new FixedClock(),
			idGenerator: new SequenceIdGenerator(),
			toolExecutor,
		});

		const chunks = await collectTurn(
			useCase.run({ sessionId, prompt: 'Explain find_by_email' }),
		);

		expect(chunks).toEqual([
			{
				contentDelta: 'find_by_email compares lowercased emails.',
			},
		]);
		expect(toolExecutor.receivedRequests).toEqual([
			{
				toolName: 'search_file',
				toolInput: { query: 'find_by_email' },
			},
			{
				toolName: 'read_file',
				toolInput: { path: 'src/users.py' },
			},
		]);
		expect(model.receivedInputs).toHaveLength(3);
		expect(model.receivedInputs.every((input) => input.tools !== undefined)).toBe(
			true,
		);
		expect(model.receivedInputs[2]?.messages.slice(-2)).toEqual([
			{
				role: 'assistant',
				content: '',
				toolCalls: [
					{
						id: asToolCallId('tool-call-7'),
						name: 'read_file',
						arguments: { path: 'src/users.py' },
					},
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('tool-call-7'),
				toolName: 'read_file',
				content:
					'{"path":"src/users.py","content":"if user.email.lower() == email.lower():"}',
			},
		]);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'assistant.message.completed',
		]);
	});

	test('stores failed tool events and sends the error back to the model', async () => {
		const sessionStore = new InMemorySessionStore();
		const model = new FailingToolCallingModel();
		const sessionId = asSessionId('session-1');
		const useCase = new RunAgentTurn({
			sessionStore,
			model,
			contextBuilder: new ContextBuilder({
				systemPrompt: 'You are a local coding agent.',
			}),
			clock: new FixedClock(),
			idGenerator: new SequenceIdGenerator(),
			toolExecutor: new FailingToolExecutor(),
		});

		const chunks = await collectTurn(
			useCase.run({ sessionId, prompt: 'Read missing file' }),
		);

		expect(chunks).toEqual([
			{
				contentDelta: 'I could not read the file.',
			},
		]);

		expect(sessionStore.events).toEqual([
			{
				id: asEventId('event-1'),
				messageId: asMessageId('message-2'),
				sessionId,
				prompt: 'Read missing file',
				type: 'prompt.submitted',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
			},
			{
				id: asEventId('event-4'),
				sessionId,
				type: 'tool.call.requested',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
				toolInput: { path: 'missing.txt' },
				approvalRequired: false,
			},
			{
				id: asEventId('event-5'),
				sessionId,
				type: 'tool.call.started',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
			},
			{
				id: asEventId('event-6'),
				sessionId,
				type: 'tool.call.failed',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
				error: {
					message: 'file missing',
					code: 'TOOL_FAILED',
					details: {
						name: 'Error',
					},
				},
			},
			{
				id: asEventId('event-7'),
				messageId: asMessageId('message-8'),
				sessionId,
				type: 'assistant.message.completed',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				content: 'I could not read the file.',
			},
		]);
	});

	test('stops tool execution after the iteration limit', async () => {
		const sessionStore = new InMemorySessionStore();
		const toolExecutor = new FakeToolExecutor();
		const sessionId = asSessionId('session-1');
		const useCase = new RunAgentTurn({
			sessionStore,
			model: new InfiniteToolCallingModel(),
			contextBuilder: new ContextBuilder({
				systemPrompt: 'You are a local coding agent.',
			}),
			clock: new FixedClock(),
			idGenerator: new SequenceIdGenerator(),
			toolExecutor,
		});

		await expect(
			collectTurn(useCase.run({ sessionId, prompt: 'Keep reading' })),
		).rejects.toThrow('Tool iteration limit reached.');

		expect(toolExecutor.receivedRequests).toHaveLength(3);
		expect(sessionStore.events.at(-1)).toEqual({
			id: asEventId('event-15'),
			sessionId,
			type: 'agent.error',
			timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
			error: {
				message: 'Tool iteration limit reached.',
				code: 'TOOL_ITERATION_LIMIT_REACHED',
				recoverable: true,
				details: {
					name: 'Error',
				},
			},
		});
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
