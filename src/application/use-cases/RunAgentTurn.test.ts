import { describe, expect, test } from 'bun:test';

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
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { RecordingToolExecutor } from '@/test-support/RecordingToolExecutor';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type { ModelStreamChunk } from '../ports/ModelPort';
import { ContextBuilder } from '../services/ContextBuilder';
import { reduceAgentState } from '../services/SessionReducer';
import {
	RunAgentTurn,
	type RunAgentTurnDependencies,
	type ToolApprovalRequest,
} from './RunAgentTurn';

const textResponse = (...contentDeltas: string[]): ModelStreamChunk[] =>
	contentDeltas.map((contentDelta) => ({ contentDelta }));

const toolCall = (name: string, toolArguments: unknown): ModelToolCall => ({
	name,
	arguments: toolArguments,
});

const toolCallResponse = (toolCalls: ModelToolCall[], contentDelta = ''): ModelStreamChunk[] => [
	{ contentDelta, toolCalls },
];

const readFileToolCall = (path: string): ModelToolCall => toolCall('read_file', { path });

const searchFileToolCall = (query: unknown): ModelToolCall => toolCall('search_file', { query });

const editFileToolCall = (): ModelToolCall =>
	toolCall('edit_file', {
		path: 'src/file.ts',
		oldText: 'const value = 1;',
		newText: 'const value = 2;',
	});

const readToolDefinition: ToolDefinition = {
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
};

const looseReadToolDefinition: ToolDefinition = {
	name: 'read_file',
	description: 'Read a file',
	parameters: {},
};

const searchToolDefinition: ToolDefinition = {
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
};

const editToolDefinition: ToolDefinition = {
	name: 'edit_file',
	description: 'Edit a file',
	requiresApproval: true,
	parameters: {
		type: 'object',
		required: ['path', 'oldText', 'newText'],
		properties: {
			path: {
				type: 'string',
			},
			oldText: {
				type: 'string',
			},
			newText: {
				type: 'string',
			},
		},
	},
};

const looseEditToolDefinition: ToolDefinition = {
	name: 'edit_file',
	description: 'Edit a file',
	requiresApproval: true,
	parameters: {},
};

const createReadToolExecutor = (): RecordingToolExecutor =>
	new RecordingToolExecutor([readToolDefinition], (request) => ({
		toolName: request.toolName,
		output: {
			path: 'README.md',
			content: 'hello',
		},
	}));

const createEditToolExecutor = (): RecordingToolExecutor =>
	new RecordingToolExecutor([editToolDefinition], (request) => ({
		toolName: request.toolName,
		output: {
			path: 'src/file.ts',
			replaced: true,
			matchCount: 1,
		},
	}));

const createSearchReadToolExecutor = (): RecordingToolExecutor =>
	new RecordingToolExecutor([searchToolDefinition, readToolDefinition], (request) => {
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
	});

const createSecondReadFailingToolExecutor = (): RecordingToolExecutor =>
	new RecordingToolExecutor([readToolDefinition], (request, requests) => {
		if (requests.length === 2) {
			throw new Error('file missing');
		}

		return {
			toolName: request.toolName,
			output: {
				path: 'README.md',
				content: 'hello',
			},
		};
	});

const createReadEditToolExecutor = (): RecordingToolExecutor => {
	let readCount = 0;

	return new RecordingToolExecutor(
		[looseReadToolDefinition, looseEditToolDefinition],
		(request) => {
			if (request.toolName === 'read_file') {
				readCount += 1;

				return {
					toolName: request.toolName,
					output: { content: `version-${readCount}` },
				};
			}

			return {
				toolName: request.toolName,
				output: { replaced: true },
			};
		},
	);
};

const createFailingToolExecutor = (): RecordingToolExecutor =>
	new RecordingToolExecutor([readToolDefinition], () => {
		throw new Error('file missing');
	});

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

type RunAgentTurnHarnessOptions = {
	model: ScriptedModel;
	toolExecutor?: RecordingToolExecutor;
	approveToolCall?: RunAgentTurnDependencies['approveToolCall'];
	maxContextCharacters?: number;
};

const createRunAgentTurnHarness = ({
	model,
	toolExecutor,
	approveToolCall,
	maxContextCharacters,
}: RunAgentTurnHarnessOptions) => {
	const sessionStore = new InMemorySessionStore();
	const sessionId = asSessionId('session-1');
	const dependencies: RunAgentTurnDependencies = {
		sessionStore,
		model,
		contextBuilder: new ContextBuilder({
			systemPrompt: 'You are a local coding agent.',
			...(maxContextCharacters === undefined ? {} : { maxContextCharacters }),
		}),
		clock: new FixedClock(),
		idGenerator: new SequenceIdGenerator(),
		...(toolExecutor === undefined ? {} : { toolExecutor }),
		...(approveToolCall === undefined ? {} : { approveToolCall }),
	};

	return {
		useCase: new RunAgentTurn(dependencies),
		sessionStore,
		sessionId,
	};
};

describe('RunAgentTurn', () => {
	test('stores prompt, streams model chunks, and stores completed assistant message', async () => {
		const model = new ScriptedModel([textResponse('Hello', ' there')]);
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
		});

		const chunks: ModelStreamChunk[] = [];

		for await (const chunk of useCase.run({
			sessionId,
			prompt: 'Say hello',
			modelName: 'qwen3:8b',
		})) {
			chunks.push(chunk);
		}

		expect(chunks).toEqual([{ contentDelta: 'Hello' }, { contentDelta: ' there' }]);
		expect(model.receivedInputs[0]).toEqual({
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
				modelName: 'qwen3:8b',
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

	test('passes an abort signal to the model request', async () => {
		const model = new ScriptedModel([textResponse('Hello', ' there')]);
		const { sessionId, useCase } = createRunAgentTurnHarness({ model });
		const abortController = new AbortController();

		await collectAsyncIterable(
			useCase.run({
				sessionId,
				prompt: 'Say hello',
				signal: abortController.signal,
			}),
		);

		expect(model.receivedInputs[0]?.signal).toBe(abortController.signal);
	});

	test('streams a final text response without executing available tools', async () => {
		const toolExecutor = createReadToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([textResponse('Hello', ' there')]),
			toolExecutor,
		});

		const chunks = await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Say hello' }));

		expect(chunks).toEqual([{ contentDelta: 'Hello' }, { contentDelta: ' there' }]);
		expect(toolExecutor.receivedRequests).toEqual([]);
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'assistant.message.completed',
			content: 'Hello there',
		});
	});

	test('stores a completed assistant message for an empty model response', async () => {
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([[]]),
		});

		const chunks = await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Say nothing' }));

		expect(chunks).toEqual([]);
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'assistant.message.completed',
			content: '',
		});
	});

	test('rejects empty prompts before storing events', async () => {
		const { sessionStore, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([]),
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId: asSessionId('session-1'), prompt: ' ' })),
		).rejects.toThrow('Prompt cannot be empty.');
		expect(sessionStore.events).toEqual([]);
	});

	test('rejects a prompt that exceeds the context budget before storing it', async () => {
		const model = new ScriptedModel([textResponse('unused')]);
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			maxContextCharacters: 160,
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'x'.repeat(300) })),
		).rejects.toThrow('Current turn exceeds the model context budget');
		expect(sessionStore.events).toEqual([]);
		expect(model.receivedInputs).toEqual([]);
	});

	test('stores agent error when model streaming fails', async () => {
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([new Error('model failed')]),
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Say hello' })),
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

	test('does not store a completed assistant message when model fails after deltas', async () => {
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([
				{
					chunks: textResponse('partial ', 'answer'),
					error: new Error('Ollama stream failed: model failed'),
				},
			]),
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Say hello' })),
		).rejects.toThrow('Ollama stream failed: model failed');

		expect(sessionStore.events.some((event) => event.type === 'assistant.message.completed')).toBe(
			false,
		);
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'agent.error',
			error: {
				code: 'MODEL_STREAM_FAILED',
			},
		});
	});

	test('executes one model tool call and stores the completed tool event', async () => {
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('README.md')]),
			textResponse('The file contains ', 'hello.'),
		]);
		const toolExecutor = createReadToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});

		const chunks = await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read README' }));

		expect(chunks).toEqual([
			{
				contentDelta: 'The file contains ',
			},
			{
				contentDelta: 'hello.',
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
						id: asMessageId('message-5'),
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
				messageId: asMessageId('message-5'),
				sessionId,
				type: 'assistant.tool_calls.completed',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
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
				id: asEventId('event-6'),
				sessionId,
				type: 'tool.call.requested',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
				toolInput: { path: 'README.md' },
				approvalRequired: false,
			},
			{
				id: asEventId('event-7'),
				sessionId,
				type: 'tool.call.started',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
			},
			{
				id: asEventId('event-8'),
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
				id: asEventId('event-9'),
				messageId: asMessageId('message-10'),
				sessionId,
				type: 'assistant.message.completed',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				content: 'The file contains hello.',
			},
		]);
	});

	test('passes an abort signal through tool-enabled model rounds', async () => {
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('README.md')]),
			textResponse('The file contains ', 'hello.'),
		]);
		const toolExecutor = createReadToolExecutor();
		const { sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});
		const abortController = new AbortController();

		await collectAsyncIterable(
			useCase.run({
				sessionId,
				prompt: 'Read README',
				signal: abortController.signal,
			}),
		);

		expect(model.receivedInputs).toHaveLength(2);
		expect(model.receivedInputs.every((input) => input.signal === abortController.signal)).toBe(
			true,
		);
	});

	test('executes search once and sends its complete result to the final model round', async () => {
		const model = new ScriptedModel([
			toolCallResponse([searchFileToolCall('UserRepository')]),
			textResponse('UserRepository is defined ', 'in src/users.py.'),
		]);
		const toolExecutor = createSearchReadToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});

		const chunks = await collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'Find UserRepository' }),
		);

		expect(chunks).toEqual([
			{ contentDelta: 'UserRepository is defined ' },
			{ contentDelta: 'in src/users.py.' },
		]);
		expect(toolExecutor.receivedRequests).toEqual([
			{
				toolName: 'search_file',
				toolInput: { query: 'UserRepository' },
			},
		]);
		expect(model.receivedInputs[1]?.messages.at(-1)).toEqual({
			role: 'tool',
			toolCallId: asToolCallId('tool-call-3'),
			toolName: 'search_file',
			content:
				'{"matches":[{"path":"src/users.py","line":10,"text":"def find_by_email(self, email: str) -> User | None:"}]}',
		});
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'assistant.message.completed',
			content: 'UserRepository is defined in src/users.py.',
		});
	});

	test('keeps tool-round text in model context without publishing it as final text', async () => {
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('README.md')], 'I will inspect the file.\n'),
			textResponse('The file contains hello.'),
		]);
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor: createReadToolExecutor(),
		});

		const chunks = await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read README' }));

		expect(chunks).toEqual([{ contentDelta: 'The file contains hello.' }]);
		expect(model.receivedInputs[1]?.messages.at(-2)).toMatchObject({
			role: 'assistant',
			content: 'I will inspect the file.\n',
			toolCalls: [
				{
					name: 'read_file',
					arguments: { path: 'README.md' },
				},
			],
		});
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'assistant.message.completed',
			content: 'The file contains hello.',
		});
		expect(sessionStore.events[1]).toMatchObject({
			type: 'assistant.tool_calls.completed',
			content: 'I will inspect the file.\n',
			toolCalls: [
				{
					name: 'read_file',
					arguments: { path: 'README.md' },
				},
			],
		});
	});

	test('requires approval before executing a mutating tool call', async () => {
		const model = new ScriptedModel([
			toolCallResponse([editFileToolCall()]),
			textResponse('Edit handled.'),
		]);
		const toolExecutor = createEditToolExecutor();
		const approvalRequests: ToolApprovalRequest[] = [];
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
			approveToolCall: async (request) => {
				approvalRequests.push(request);
				return true;
			},
		});

		const chunks = await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Edit file' }));

		expect(chunks).toEqual([{ contentDelta: 'Edit handled.' }]);
		expect(approvalRequests).toEqual([
			{
				sessionId,
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'edit_file',
				toolInput: {
					path: 'src/file.ts',
					oldText: 'const value = 1;',
					newText: 'const value = 2;',
				},
			},
		]);
		expect(toolExecutor.receivedRequests).toEqual([
			{
				toolName: 'edit_file',
				toolInput: {
					path: 'src/file.ts',
					oldText: 'const value = 1;',
					newText: 'const value = 2;',
				},
			},
		]);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'assistant.message.completed',
		]);
		expect(sessionStore.events[2]).toMatchObject({
			type: 'tool.call.requested',
			toolName: 'edit_file',
			approvalRequired: true,
		});
	});

	test('does not execute a mutating tool call when approval is denied', async () => {
		const model = new ScriptedModel([toolCallResponse([editFileToolCall()])]);
		const toolExecutor = createEditToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
			approveToolCall: async () => false,
		});

		const chunks = await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Edit file' }));

		expect(chunks).toEqual([{ contentDelta: 'Tool call was not approved: edit_file' }]);
		expect(toolExecutor.receivedRequests).toEqual([]);
		expect(model.receivedInputs).toHaveLength(1);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.failed',
			'assistant.message.completed',
		]);
		expect(sessionStore.events[2]).toMatchObject({
			type: 'tool.call.requested',
			toolName: 'edit_file',
			approvalRequired: true,
		});
		expect(sessionStore.events[3]).toMatchObject({
			type: 'tool.call.failed',
			toolName: 'edit_file',
			error: {
				message: 'Tool call was not approved: edit_file',
				code: 'TOOL_APPROVAL_DENIED',
			},
		});
		expect(sessionStore.events[4]).toMatchObject({
			type: 'assistant.message.completed',
			content: 'Tool call was not approved: edit_file',
		});
	});

	test('closes the remaining tool calls in a batch after approval is denied', async () => {
		const model = new ScriptedModel([
			toolCallResponse([editFileToolCall(), readFileToolCall('src/file.ts')]),
		]);
		const toolExecutor = createReadEditToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
			approveToolCall: async () => false,
		});

		await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Edit and read file' }));

		expect(toolExecutor.receivedRequests).toEqual([]);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.failed',
			'tool.call.requested',
			'tool.call.failed',
			'assistant.message.completed',
		]);
		expect(sessionStore.events[3]).toMatchObject({
			type: 'tool.call.failed',
			error: { code: 'TOOL_APPROVAL_DENIED' },
		});
		expect(sessionStore.events[5]).toMatchObject({
			type: 'tool.call.failed',
			error: { code: 'TOOL_BATCH_CANCELLED' },
		});

		const rebuiltState = reduceAgentState(sessionId, sessionStore.events);

		expect(rebuiltState.messages.map((message) => message.role)).toEqual([
			'user',
			'assistant',
			'tool',
			'tool',
			'assistant',
		]);
	});

	test('allows the model to chain search and read tool calls before answering', async () => {
		const model = new ScriptedModel([
			toolCallResponse([searchFileToolCall('find_by_email')]),
			toolCallResponse([readFileToolCall('src/users.py')]),
			textResponse('find_by_email compares ', 'lowercased emails.'),
		]);
		const toolExecutor = createSearchReadToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});

		const chunks = await collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'Explain find_by_email' }),
		);

		expect(chunks).toEqual([
			{ contentDelta: 'find_by_email compares ' },
			{ contentDelta: 'lowercased emails.' },
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
		expect(model.receivedInputs.every((input) => input.tools !== undefined)).toBe(true);
		expect(model.receivedInputs[1]?.messages.slice(-2)).toEqual([
			{
				id: asMessageId('message-5'),
				role: 'assistant',
				content: '',
				toolCalls: [
					{
						id: asToolCallId('tool-call-3'),
						name: 'search_file',
						arguments: { query: 'find_by_email' },
					},
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'search_file',
				content:
					'{"matches":[{"path":"src/users.py","line":10,"text":"def find_by_email(self, email: str) -> User | None:"}]}',
			},
		]);
		expect(model.receivedInputs[2]?.messages.slice(-2)).toEqual([
			{
				id: asMessageId('message-11'),
				role: 'assistant',
				content: '',
				toolCalls: [
					{
						id: asToolCallId('tool-call-9'),
						name: 'read_file',
						arguments: { path: 'src/users.py' },
					},
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('tool-call-9'),
				toolName: 'read_file',
				content: '{"path":"src/users.py","content":"if user.email.lower() == email.lower():"}',
			},
		]);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'assistant.message.completed',
		]);
	});

	test('executes multiple tool calls from one model response in order', async () => {
		const model = new ScriptedModel([
			toolCallResponse([searchFileToolCall('UserRepository'), readFileToolCall('src/users.py')]),
			textResponse('Both tools completed.'),
		]);
		const toolExecutor = createSearchReadToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});

		const chunks = await collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'Search and read' }),
		);

		expect(chunks).toEqual([{ contentDelta: 'Both tools completed.' }]);
		expect(toolExecutor.receivedRequests).toEqual([
			{
				toolName: 'search_file',
				toolInput: { query: 'UserRepository' },
			},
			{
				toolName: 'read_file',
				toolInput: { path: 'src/users.py' },
			},
		]);
		expect(model.receivedInputs[1]?.messages.slice(-3)).toEqual([
			{
				id: asMessageId('message-6'),
				role: 'assistant',
				content: '',
				toolCalls: [
					{
						id: asToolCallId('tool-call-3'),
						name: 'search_file',
						arguments: { query: 'UserRepository' },
					},
					{
						id: asToolCallId('tool-call-4'),
						name: 'read_file',
						arguments: { path: 'src/users.py' },
					},
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'search_file',
				content:
					'{"matches":[{"path":"src/users.py","line":10,"text":"def find_by_email(self, email: str) -> User | None:"}]}',
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('tool-call-4'),
				toolName: 'read_file',
				content: '{"path":"src/users.py","content":"if user.email.lower() == email.lower():"}',
			},
		]);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'assistant.message.completed',
		]);

		const rebuiltState = reduceAgentState(sessionId, sessionStore.events);

		expect(rebuiltState.messages.slice(0, -1)).toEqual(
			model.receivedInputs[1]?.messages.slice(1) ?? [],
		);
	});

	test('sends a failed second tool result back to the model', async () => {
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('README.md'), readFileToolCall('missing.py')]),
			textResponse('Second read failed.'),
		]);
		const toolExecutor = createSecondReadFailingToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});

		const chunks = await collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'Search and read missing file' }),
		);

		expect(chunks).toEqual([{ contentDelta: 'Second read failed.' }]);
		expect(toolExecutor.receivedRequests).toEqual([
			{
				toolName: 'read_file',
				toolInput: { path: 'README.md' },
			},
			{
				toolName: 'read_file',
				toolInput: { path: 'missing.py' },
			},
		]);
		expect(model.receivedInputs[1]?.messages.at(-1)).toEqual({
			role: 'tool',
			toolCallId: asToolCallId('tool-call-4'),
			toolName: 'read_file',
			content: '{"error":{"message":"file missing"}}',
		});
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.failed',
			'assistant.message.completed',
		]);

		const rebuiltState = reduceAgentState(sessionId, sessionStore.events);

		expect(rebuiltState.messages.slice(0, -1)).toEqual(
			model.receivedInputs[1]?.messages.slice(1) ?? [],
		);
	});

	test('requests approval before executing the second tool in a batch', async () => {
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('src/file.ts'), editFileToolCall()]),
			textResponse('Edit completed.'),
		]);
		const toolExecutor = createReadEditToolExecutor();
		const approvalRequests: ToolApprovalRequest[] = [];
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
			approveToolCall: async (request) => {
				approvalRequests.push(request);
				return true;
			},
		});

		const chunks = await collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'Search and edit' }),
		);

		expect(chunks).toEqual([{ contentDelta: 'Edit completed.' }]);
		expect(approvalRequests).toEqual([
			{
				sessionId,
				toolCallId: asToolCallId('tool-call-4'),
				toolName: 'edit_file',
				toolInput: {
					path: 'src/file.ts',
					oldText: 'const value = 1;',
					newText: 'const value = 2;',
				},
			},
		]);
		expect(toolExecutor.receivedRequests).toEqual([
			{
				toolName: 'read_file',
				toolInput: { path: 'src/file.ts' },
			},
			{
				toolName: 'edit_file',
				toolInput: {
					path: 'src/file.ts',
					oldText: 'const value = 1;',
					newText: 'const value = 2;',
				},
			},
		]);
		expect(sessionStore.events[5]).toMatchObject({
			type: 'tool.call.requested',
			toolName: 'edit_file',
			approvalRequired: true,
		});
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
			'assistant.message.completed',
		]);
	});

	test('does not execute a tool when the model stream ends with an error', async () => {
		const toolExecutor = createSearchReadToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([
				{
					chunks: toolCallResponse([searchFileToolCall('UserRepository')]),
					error: new Error('Ollama stream ended before completion.'),
				},
			]),
			toolExecutor,
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Find UserRepository' })),
		).rejects.toThrow('Ollama stream ended before completion.');

		expect(toolExecutor.receivedRequests).toEqual([]);
		expect(sessionStore.events.some((event) => event.type === 'tool.call.started')).toBe(false);
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'agent.error',
			error: {
				message: 'Ollama stream ended before completion.',
				code: 'MODEL_STREAM_FAILED',
			},
		});
	});

	test('does not execute a tool with invalid arguments', async () => {
		const toolExecutor = createSearchReadToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([toolCallResponse([searchFileToolCall(42)])]),
			toolExecutor,
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Find UserRepository' })),
		).rejects.toThrow('Invalid arguments for tool search_file: "query" must be string.');

		expect(toolExecutor.receivedRequests).toEqual([]);
		expect(sessionStore.events.some((event) => event.type === 'tool.call.started')).toBe(false);
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'agent.error',
			error: {
				code: 'MODEL_TOOL_CALL_INVALID',
			},
		});
	});

	test('caches read tools during a turn and clears the cache after an edit', async () => {
		const toolExecutor = createReadEditToolExecutor();
		const { sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([
				toolCallResponse([readFileToolCall('src/file.ts')]),
				toolCallResponse([readFileToolCall('src/file.ts')]),
				toolCallResponse([editFileToolCall()]),
				toolCallResponse([readFileToolCall('src/file.ts')]),
				textResponse('Done.'),
			]),
			toolExecutor,
			approveToolCall: async () => true,
		});

		const chunks = await collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'Read, edit, and read again' }),
		);

		expect(chunks).toEqual([{ contentDelta: 'Done.' }]);
		expect(toolExecutor.receivedRequests.map((request) => request.toolName)).toEqual([
			'read_file',
			'edit_file',
			'read_file',
		]);
	});

	test('stores failed tool events and sends the error back to the model', async () => {
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('missing.txt')]),
			textResponse('I could not read the file.'),
		]);
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor: createFailingToolExecutor(),
		});

		const chunks = await collectAsyncIterable(
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
				messageId: asMessageId('message-5'),
				sessionId,
				type: 'assistant.tool_calls.completed',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				content: '',
				toolCalls: [
					{
						id: asToolCallId('tool-call-3'),
						name: 'read_file',
						arguments: { path: 'missing.txt' },
					},
				],
			},
			{
				id: asEventId('event-6'),
				sessionId,
				type: 'tool.call.requested',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
				toolInput: { path: 'missing.txt' },
				approvalRequired: false,
			},
			{
				id: asEventId('event-7'),
				sessionId,
				type: 'tool.call.started',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId: asToolCallId('tool-call-3'),
				toolName: 'read_file',
			},
			{
				id: asEventId('event-8'),
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
				id: asEventId('event-9'),
				messageId: asMessageId('message-10'),
				sessionId,
				type: 'assistant.message.completed',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				content: 'I could not read the file.',
			},
		]);
	});

	test('stores an agent error when tool results exceed the current-turn context budget', async () => {
		const toolExecutor = new RecordingToolExecutor([readToolDefinition], (request) => ({
			toolName: request.toolName,
			output: { path: 'large.txt', content: 'x'.repeat(500) },
		}));
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([toolCallResponse([readFileToolCall('large.txt')])]),
			toolExecutor,
			maxContextCharacters: 400,
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read large file' })),
		).rejects.toThrow('Current turn exceeds the model context budget');
		expect(toolExecutor.receivedRequests).toHaveLength(1);
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'agent.error',
			error: { code: 'CONTEXT_BUDGET_EXCEEDED' },
		});
	});

	test('stops tool execution after the iteration limit', async () => {
		const toolExecutor = createReadToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel(
				Array.from({ length: 12 }, () => toolCallResponse([readFileToolCall('README.md')])),
			),
			toolExecutor,
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Keep reading' })),
		).rejects.toThrow('Tool iteration limit reached.');

		expect(toolExecutor.receivedRequests).toHaveLength(1);
		expect(sessionStore.events.at(-1)).toMatchObject({
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
