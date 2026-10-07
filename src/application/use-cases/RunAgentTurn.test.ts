import { SessionService } from '@/application/services/SessionService';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { createDeferred } from '@/test-support/createDeferred';
import { describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { defineLocalTool } from '@/infrastructure/tools/LocalTool';
import { LocalToolRegistry } from '@/infrastructure/tools/LocalToolExecutor';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
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
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { RecordingToolExecutor } from '@/test-support/RecordingToolExecutor';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import {
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
	toolCallRequestedEvent,
	toolCallStartedEvent,
} from '@/test-support/AgentEventFixtures';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type { ModelPort, ModelStreamChunk } from '../ports/ModelPort';
import type { MonotonicClockPort } from '../ports/MonotonicClockPort';
import { ContextBudgetExceededError, ContextBuilder } from '../services/ContextBuilder';
import { InMemoryAgentMetrics } from '../services/InMemoryAgentMetrics';
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
	deduplicate: true,
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
	invalidatesWorkspaceCache: true,
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
	invalidatesWorkspaceCache: true,
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
	new RecordingToolExecutor(
		[searchToolDefinition, readToolDefinition],
		(request) => {
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
		},
		(request) => {
			if (
				request.toolName === 'search_file' &&
				(typeof request.toolInput !== 'object' ||
					request.toolInput === null ||
					!('query' in request.toolInput) ||
					typeof request.toolInput.query !== 'string')
			) {
				throw new Error('Invalid arguments for tool search_file: "query" must be string.');
			}

			return request;
		},
	);

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

const createSearchEditToolExecutor = (): RecordingToolExecutor => {
	let searchCount = 0;

	return new RecordingToolExecutor([searchToolDefinition, looseEditToolDefinition], (request) => {
		if (request.toolName === 'search_file') {
			searchCount += 1;

			return {
				toolName: request.toolName,
				output: { version: searchCount },
			};
		}

		return {
			toolName: request.toolName,
			output: { replaced: true },
		};
	});
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

class SequenceMonotonicClock implements MonotonicClockPort {
	constructor(private readonly values: number[]) {}

	nowMilliseconds(): number {
		const value = this.values.shift();

		if (value === undefined) {
			throw new Error('No monotonic clock value configured.');
		}

		return value;
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

// Capture authority when the model is actually called, before consuming its response.
// Every comparison creates an independent service/reducer and builder from durable data.
const checkRequestBoundaries = (
	model: ModelPort,
	sessionId: SessionId,
	readCommittedEvents: () => AgentEvent[] | Promise<AgentEvent[]>,
	contextOptions: ConstructorParameters<typeof ContextBuilder>[0],
	freshSessions?: () => SessionService,
) => {
	const prefixes: AgentEvent[][] = [];
	const checkedModel: ModelPort = {
		async *streamChat(input) {
			const prefix: AgentEvent[] = JSON.parse(JSON.stringify(await readCommittedEvents()));
			const replay =
				freshSessions?.() ?? new SessionService(new InMemorySessionStore({ events: prefix }));
			const state = await replay.readSessionState(sessionId);
			expect(state).toEqual(reduceAgentState(sessionId, prefix));
			expect(input.messages).toEqual(new ContextBuilder(contextOptions).build(state).messages);
			prefixes.push(prefix);
			yield* model.streamChat(input);
		},
	};
	return { model: checkedModel, prefixes };
};

type RunAgentTurnHarnessOptions = {
	model: ScriptedModel;
	toolExecutor?: RecordingToolExecutor;
	approveToolCall?: RunAgentTurnDependencies['approveToolCall'];
	maxContextCharacters?: number;
	agentMetrics?: RunAgentTurnDependencies['agentMetrics'];
	monotonicClock?: RunAgentTurnDependencies['monotonicClock'];
	events?: AgentEvent[];
};

const createRunAgentTurnHarness = ({
	model,
	toolExecutor,
	approveToolCall,
	maxContextCharacters,
	agentMetrics,
	monotonicClock,
	events = [],
}: RunAgentTurnHarnessOptions) => {
	const sessionStore = new InMemorySessionStore({ events });
	const sessionId = asSessionId('session-1');
	const sessions = new SessionService(sessionStore);
	const contextOptions = {
		systemPrompt: 'You are a local coding agent.',
		maxContextCharacters: maxContextCharacters ?? 120_000,
	};
	const contextBuilder = new ContextBuilder(contextOptions);
	const boundaryChecks = checkRequestBoundaries(
		model,
		sessionId,
		() => sessionStore.events,
		contextOptions,
	);
	const dependencies: RunAgentTurnDependencies = {
		sessionStore: sessions,
		model: boundaryChecks.model,
		contextBuilder,
		clock: new FixedClock(),
		idGenerator: new SequenceIdGenerator(),
		...(toolExecutor === undefined ? {} : { toolExecutor }),
		...(approveToolCall === undefined ? {} : { approveToolCall }),
		...(agentMetrics === undefined ? {} : { agentMetrics }),
		...(monotonicClock === undefined ? {} : { monotonicClock }),
	};

	return {
		useCase: new RunAgentTurn(dependencies),
		requestPrefixes: boundaryChecks.prefixes,
		sessions,
		contextBuilder,
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

	test('reads a session once across consecutive turns in the same runtime', async () => {
		const model = new ScriptedModel([
			textResponse('First response.'),
			textResponse('Second response.'),
		]);
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({ model });

		await collectAsyncIterable(useCase.run({ sessionId, prompt: 'First prompt' }));
		await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Second prompt' }));

		expect(sessionStore.readCount).toBe(1);
		expect(model.receivedInputs[1]?.messages).toEqual([
			{ role: 'system', content: 'You are a local coding agent.' },
			expect.objectContaining({ role: 'user', content: 'First prompt' }),
			expect.objectContaining({ role: 'assistant', content: 'First response.' }),
			expect.objectContaining({ role: 'user', content: 'Second prompt' }),
		]);
	});

	test('records model rounds, request sizes, and tool resource metrics', async () => {
		const agentMetrics = new InMemoryAgentMetrics();
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('README.md')]),
			textResponse('Done.'),
		]);
		const { sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor: createReadToolExecutor(),
			agentMetrics,
			monotonicClock: new SequenceMonotonicClock([10, 15]),
		});

		await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read the file' }));

		const turn = agentMetrics.snapshot(sessionId).completedTurns[0];
		expect(turn).toMatchObject({
			sessionId,
			modelRounds: 2,
			tools: {
				executions: 1,
				failed: 0,
				reused: 0,
				durationMs: { total: 5, max: 5 },
			},
		});
		expect(turn?.modelRequestCharacters.total).toBeGreaterThan(0);
		expect(turn?.modelRequestCharacters.max).toBeGreaterThan(0);
		expect(turn?.tools.outputCharacters.total).toBeGreaterThan(0);
	});

	test('does not change turn behavior when diagnostics fail', async () => {
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('README.md')]),
			textResponse('Done.'),
		]);
		const { sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor: createReadToolExecutor(),
			agentMetrics: {
				startTurn: () => ({
					recordModelRequest: () => {
						throw new Error('metrics failed');
					},
					recordToolExecution: () => {
						throw new Error('metrics failed');
					},
					complete: () => {
						throw new Error('metrics failed');
					},
				}),
			},
			monotonicClock: {
				nowMilliseconds: () => {
					throw new Error('clock failed');
				},
			},
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read the file' })),
		).resolves.toEqual([{ contentDelta: 'Done.' }]);
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
		expect(sessionStore.readCount).toBe(0);
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

	test('streams tool-round text live and keeps it in model context', async () => {
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('README.md')], 'I will inspect the file.\n'),
			textResponse('The file contains hello.'),
		]);
		const { sessionStore, sessionId, useCase, requestPrefixes } = createRunAgentTurnHarness({
			model,
			toolExecutor: createReadToolExecutor(),
		});

		const chunks = await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read README' }));

		expect(requestPrefixes).toHaveLength(2);
		expect(chunks).toEqual([
			{ contentDelta: 'I will inspect the file.\n' },
			{ contentDelta: 'The file contains hello.' },
		]);
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
		const { sessionStore, sessionId, useCase, requestPrefixes } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});

		const chunks = await collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'Search and read' }),
		);

		expect(requestPrefixes).toHaveLength(2);
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
		const { sessionStore, sessionId, useCase, requestPrefixes } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});

		const chunks = await collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'Search and read missing file' }),
		);

		expect(requestPrefixes).toHaveLength(2);
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

	test('validates a complete tool batch before persisting or executing its first call', async () => {
		const toolExecutor = createSearchReadToolExecutor();
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model: new ScriptedModel([
				toolCallResponse([readFileToolCall('README.md'), searchFileToolCall(42)]),
			]),
			toolExecutor,
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read and search' })),
		).rejects.toThrow('Invalid arguments for tool search_file');

		expect(toolExecutor.receivedRequests).toEqual([]);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'agent.error',
		]);
	});

	test('executes repeated read_file calls instead of serving stale cached content', async () => {
		const toolExecutor = createReadEditToolExecutor();
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('src/file.ts')]),
			toolCallResponse([readFileToolCall('src/file.ts')]),
			textResponse('Done.'),
		]);
		const { sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});

		await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read twice' }));

		expect(toolExecutor.receivedRequests.map((request) => request.toolName)).toEqual([
			'read_file',
			'read_file',
		]);
		expect(model.receivedInputs[2]?.messages.at(-1)).toMatchObject({
			role: 'tool',
			content: '{"content":"version-2"}',
		});
	});

	test('deduplicates search_file output with a persisted reference to the source call', async () => {
		const toolExecutor = createSearchReadToolExecutor();
		const model = new ScriptedModel([
			toolCallResponse([searchFileToolCall('UserRepository')]),
			toolCallResponse([searchFileToolCall('UserRepository')]),
			textResponse('Done.'),
		]);
		const { sessionStore, sessionId, useCase, requestPrefixes } = createRunAgentTurnHarness({
			model,
			toolExecutor,
		});

		await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Search twice' }));

		expect(requestPrefixes).toHaveLength(3);
		expect(toolExecutor.receivedRequests).toHaveLength(1);
		expect(model.receivedInputs[2]?.messages.at(-1)).toMatchObject({
			role: 'tool',
			content:
				'{"cached":true,"sourceToolCallId":"tool-call-3","message":"Result reused from tool call tool-call-3."}',
		});
		expect(
			sessionStore.events.filter((event) => event.type === 'tool.call.completed').at(-1),
		).toMatchObject({
			output: {
				cached: true,
				sourceToolCallId: asToolCallId('tool-call-3'),
			},
		});

		const rebuiltState = reduceAgentState(sessionId, sessionStore.events);

		expect(rebuiltState.messages.slice(0, -1)).toEqual(
			model.receivedInputs[2]?.messages.slice(1) ?? [],
		);
	});

	test('clears deduplicated search references after a successful edit', async () => {
		const toolExecutor = createSearchEditToolExecutor();
		const model = new ScriptedModel([
			toolCallResponse([searchFileToolCall('value')]),
			toolCallResponse([searchFileToolCall('value')]),
			toolCallResponse([editFileToolCall()]),
			toolCallResponse([searchFileToolCall('value')]),
			textResponse('Done.'),
		]);
		const { sessionId, useCase, requestPrefixes } = createRunAgentTurnHarness({
			model,
			toolExecutor,
			approveToolCall: async () => true,
		});

		await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Search, edit, and search' }));

		expect(requestPrefixes).toHaveLength(5);
		expect(toolExecutor.receivedRequests.map((request) => request.toolName)).toEqual([
			'search_file',
			'edit_file',
			'search_file',
		]);
		expect(model.receivedInputs[4]?.messages.at(-1)).toMatchObject({
			role: 'tool',
			content: '{"version":2}',
		});
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
		const model = new ScriptedModel([toolCallResponse([readFileToolCall('large.txt')])]);
		const { sessionStore, sessionId, useCase } = createRunAgentTurnHarness({
			model,
			toolExecutor,
			maxContextCharacters: 400,
		});

		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read large file' })),
		).rejects.toThrow('Current turn exceeds the model context budget');
		expect(toolExecutor.receivedRequests).toHaveLength(1);
		expect(model.receivedInputs).toHaveLength(1);
		expect(sessionStore.events.filter((event) => event.type === 'prompt.submitted')).toHaveLength(
			1,
		);
		expect(
			sessionStore.events.filter((event) => event.type === 'tool.call.completed'),
		).toHaveLength(1);
		expect(
			sessionStore.events.filter((event) => event.type === 'assistant.message.completed'),
		).toHaveLength(0);
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

		expect(toolExecutor.receivedRequests).toHaveLength(12);
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

describe('RunAgentTurn lifecycle regressions', () => {
	for (const alsoAbort of [false, true]) {
		test(`successful disk mutation plus completion persistence failure terminates the turn (also abort: ${alsoAbort})`, async () => {
			const { directory, cleanup } = await createTempDirectory('turn-mutation-');
			try {
				const cause = new Error('completion storage unavailable');
				const controller = new AbortController();
				const store = new InMemorySessionStore();
				const append = store.appendSessionEvent.bind(store);
				store.appendSessionEvent = async (event) => {
					if (event.type === 'tool.call.completed') {
						if (alsoAbort) controller.abort();
						throw cause;
					}
					await append(event);
				};
				const local = createLocalToolExecutor({ workspaceRoot: directory });
				const executor = new RecordingToolExecutor(
					local.listTools(),
					() => {
						throw new Error('Expected bound prepared execution');
					},
					(request) => local.prepare(request),
				);
				const model = new ScriptedModel([
					toolCallResponse([
						toolCall('create_file', { path: 'created.txt', content: 'durable side effect' }),
						readFileToolCall('created.txt'),
					]),
					textResponse('should never be requested'),
				]);
				const loop = new RunAgentTurn({
					sessionStore: new SessionService(store),
					model,
					toolExecutor: executor,
					clock: new FixedClock(),
					idGenerator: new SequenceIdGenerator(),
					contextBuilder: new ContextBuilder({
						systemPrompt: 'test',
						maxContextCharacters: 120_000,
					}),
					approveToolCall: async (_request, options) => {
						expect(options.signal).toBe(controller.signal);
						return true;
					},
				});
				const error = await collectAsyncIterable(
					loop.run({
						sessionId: asSessionId('session-1'),
						prompt: 'create',
						signal: controller.signal,
					}),
				).then(
					() => undefined,
					(error: unknown) => error,
				);
				expect(error).toBe(cause);
				expect(await readFile(join(directory, 'created.txt'), 'utf8')).toBe('durable side effect');
				expect(executor.receivedRequests).toHaveLength(1);
				expect(executor.preparationRequests).toHaveLength(2);
				expect(executor.preparedExecutions).toHaveLength(2);
				expect(executor.receivedOptions[0]?.signal).toBe(controller.signal);
				expect(model.receivedInputs).toHaveLength(1);
				expect(model.receivedInputs[0]?.signal).toBe(controller.signal);
				expect(store.events.map((event) => event.type)).toEqual([
					'prompt.submitted',
					'assistant.tool_calls.completed',
					'tool.call.requested',
					'tool.call.started',
				]);
				expect(
					reduceAgentState(asSessionId('session-1'), store.events).messages.map(
						(message) => message.role,
					),
				).toEqual(['user']);
			} finally {
				await cleanup();
			}
		});
	}

	test('already-aborted turn does not append a prompt or request the model', async () => {
		const model = new ScriptedModel([textResponse('never')]);
		const { useCase, sessionStore, sessionId } = createRunAgentTurnHarness({ model });
		const controller = new AbortController();
		controller.abort('custom reason');
		const error = await collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'hello', signal: controller.signal }),
		).then(
			() => undefined,
			(error: unknown) => error,
		);
		expect(error).toHaveProperty('name', 'AbortError');
		expect(sessionStore.events).toEqual([]);
		expect(model.receivedInputs).toEqual([]);
	});

	test('late approval after turn cancellation requests no next model round', async () => {
		const pending = createDeferred<boolean>();
		const waiting = createDeferred<void>();
		const model = new ScriptedModel([
			toolCallResponse([editFileToolCall()]),
			textResponse('never'),
		]);
		const executor = createEditToolExecutor();
		const { useCase, sessionStore, sessionId } = createRunAgentTurnHarness({
			model,
			toolExecutor: executor,
			approveToolCall: () => {
				waiting.resolve();
				return pending.promise;
			},
		});
		const controller = new AbortController();
		const outcome = collectAsyncIterable(
			useCase.run({ sessionId, prompt: 'edit', signal: controller.signal }),
		).then(
			() => undefined,
			(error: unknown) => error,
		);
		await waiting.promise;
		controller.abort();
		expect(await outcome).toHaveProperty('name', 'AbortError');
		pending.resolve(true);
		await Promise.resolve();
		expect(executor.receivedRequests.length).toBe(0);
		expect(model.receivedInputs).toHaveLength(1);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
		]);
		expect(
			reduceAgentState(sessionId, sessionStore.events).messages.map((message) => message.role),
		).toEqual(['user']);
	});

	test('successful tool during cancellation records completion but requests no next call or round', async () => {
		const controller = new AbortController();
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('one'), readFileToolCall('two')]),
			textResponse('never'),
		]);
		const executor = new RecordingToolExecutor([readToolDefinition], (request) => {
			controller.abort();
			return { toolName: request.toolName, output: 'done' };
		});
		const { useCase, sessionStore, sessionId } = createRunAgentTurnHarness({
			model,
			toolExecutor: executor,
		});
		expect(
			await collectAsyncIterable(
				useCase.run({ sessionId, prompt: 'read', signal: controller.signal }),
			).then(
				() => undefined,
				(error: unknown) => error,
			),
		).toHaveProperty('name', 'AbortError');
		expect(executor.receivedRequests).toHaveLength(1);
		expect(model.receivedInputs).toHaveLength(1);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
		]);
		expect(
			reduceAgentState(sessionId, sessionStore.events).messages.map((message) => message.role),
		).toEqual(['user']);
	});

	test('abort during complete-batch preparation prevents batch append and tools', async () => {
		const controller = new AbortController();
		const executor = new RecordingToolExecutor(
			[readToolDefinition],
			(request) => ({ toolName: request.toolName, output: 'never' }),
			(request) => {
				controller.abort();
				return request;
			},
		);
		const model = new ScriptedModel([toolCallResponse([readFileToolCall('one')])]);
		const { useCase, sessionStore, sessionId } = createRunAgentTurnHarness({
			model,
			toolExecutor: executor,
		});
		expect(
			await collectAsyncIterable(
				useCase.run({ sessionId, prompt: 'read', signal: controller.signal }),
			).then(
				() => undefined,
				(error: unknown) => error,
			),
		).toHaveProperty('name', 'AbortError');
		expect(executor.receivedRequests).toHaveLength(0);
		expect(sessionStore.events.map((event) => event.type)).toEqual(['prompt.submitted']);
	});
});

test('failure-event storage failure stops subsequent tools and model rounds with original cause', async () => {
	const cause = new Error('failed-event append unavailable');
	const store = new InMemorySessionStore();
	const append = store.appendSessionEvent.bind(store);
	store.appendSessionEvent = async (event) => {
		if (event.type === 'tool.call.failed') throw cause;
		await append(event);
	};
	const executor = createFailingToolExecutor();
	const model = new ScriptedModel([
		toolCallResponse([readFileToolCall('one'), readFileToolCall('two')]),
		textResponse('never'),
	]);
	const loop = new RunAgentTurn({
		sessionStore: new SessionService(store),
		model,
		toolExecutor: executor,
		clock: new FixedClock(),
		idGenerator: new SequenceIdGenerator(),
		contextBuilder: new ContextBuilder({ systemPrompt: 'test', maxContextCharacters: 120_000 }),
	});
	expect(
		await collectAsyncIterable(
			loop.run({ sessionId: asSessionId('session-1'), prompt: 'read' }),
		).then(
			() => undefined,
			(error: unknown) => error,
		),
	).toBe(cause);
	expect(executor.receivedRequests).toHaveLength(1);
	expect(model.receivedInputs).toHaveLength(1);
	expect(store.events.map((event) => event.type)).toEqual([
		'prompt.submitted',
		'assistant.tool_calls.completed',
		'tool.call.requested',
		'tool.call.started',
	]);
	expect(
		reduceAgentState(asSessionId('session-1'), store.events).messages.map(
			(message) => message.role,
		),
	).toEqual(['user']);
});

test('cancellation during activation prevents prompt persistence and model work', async () => {
	const entered = createDeferred<void>();
	const release = createDeferred<void>();
	const store = new InMemorySessionStore();
	const read = store.readSessionEvents.bind(store);
	store.readSessionEvents = async (id) => {
		entered.resolve();
		await release.promise;
		return read(id);
	};
	const controller = new AbortController();
	const model = new ScriptedModel([textResponse('unused')]);
	const service = new SessionService(store);
	const loop = new RunAgentTurn({
		sessionStore: service,
		model,
		clock: new FixedClock(),
		idGenerator: new SequenceIdGenerator(),
		contextBuilder: new ContextBuilder({ systemPrompt: 'test', maxContextCharacters: 120_000 }),
	});
	const outcome = collectAsyncIterable(
		loop.run({
			sessionId: asSessionId('session-1'),
			prompt: 'hello',
			signal: controller.signal,
		}),
	).catch((error: unknown) => error);
	await entered.promise;
	controller.abort();
	release.resolve();
	expect(await outcome).toHaveProperty('name', 'AbortError');
	expect(store.events).toEqual([]);
	expect(model.receivedInputs).toEqual([]);
	await service.activateSession(asSessionId('session-1'));
	expect(store.readCount).toBe(1);
});

test('normalized prepared input is approved, persisted, deduplicated and executed identically with fresh JSONL replay', async () => {
	const { directory, cleanup } = await createTempDirectory('phase-6-projection-');
	try {
		const schema = z.strictObject({
			query: z.string().trim(),
			limit: z.coerce.number().default(2),
		});
		const providerInputs: z.output<typeof schema>[] = [];
		const signal = new AbortController().signal;
		const registry = new LocalToolRegistry([
			defineLocalTool({
				name: 'normalized',
				description: 'Normalized fixture',
				inputSchema: schema,
				requiresApproval: true,
				deduplicate: true,
				execute: async (input, options) => {
					expect(options.signal).toBe(signal);
					providerInputs.push(input);
					return { query: input.query, limit: input.limit, matches: ['result'] };
				},
			}),
		]);
		const executor = new RecordingToolExecutor(
			registry.listTools(),
			() => {
				throw new Error('Expected prepared delegate');
			},
			(request) => registry.prepare(request),
		);
		const durable = new JsonlSessionStore(directory);
		const originalEvents: AgentEvent[] = [];
		const append = durable.appendSessionEvent.bind(durable);
		durable.appendSessionEvent = async (event) => {
			originalEvents.push(event);
			await append(event);
		};
		const sessions = new SessionService(durable);
		const contextBuilder = new ContextBuilder({
			systemPrompt: 'test',
			maxContextCharacters: 120_000,
		});
		const model = new ScriptedModel([
			toolCallResponse([
				toolCall('normalized', { query: ' needle ' }),
				toolCall('normalized', { query: 'needle', limit: '2' }),
			]),
			textResponse('Done.'),
		]);
		const sessionId = asSessionId('session-1');
		const boundaryChecks = checkRequestBoundaries(
			model,
			sessionId,
			() => new JsonlSessionStore(directory).readSessionEvents(sessionId),
			{ systemPrompt: 'test', maxContextCharacters: 120_000 },
			() => new SessionService(new JsonlSessionStore(directory)),
		);
		const approvals: ToolApprovalRequest[] = [];
		const loop = new RunAgentTurn({
			sessionStore: sessions,
			model: boundaryChecks.model,
			toolExecutor: executor,
			contextBuilder,
			clock: new FixedClock(),
			idGenerator: new SequenceIdGenerator(),
			approveToolCall: async (request, options) => {
				expect(options.signal).toBe(signal);
				approvals.push(request);
				return true;
			},
		});
		await collectAsyncIterable(loop.run({ sessionId, prompt: 'Normalize and search', signal }));
		expect(boundaryChecks.prefixes).toHaveLength(2);
		expect(boundaryChecks.prefixes[1]!.at(-1)?.type).toBe('tool.call.completed');
		expect(executor.preparationRequests).toHaveLength(2);
		expect(executor.preparedExecutions).toHaveLength(2);
		expect(executor.receivedRequests).toHaveLength(1);
		expect(providerInputs).toEqual([{ query: 'needle', limit: 2 }]);
		expect(approvals.map((request) => request.toolInput)).toEqual([
			{ query: 'needle', limit: 2 },
			{ query: 'needle', limit: 2 },
		]);
		const batch = originalEvents.find((event) => event.type === 'assistant.tool_calls.completed');
		if (batch?.type !== 'assistant.tool_calls.completed')
			throw new Error('Expected persisted batch');
		for (const [index, call] of batch.toolCalls.entries()) {
			expect(Object.keys(call).sort()).toEqual(['arguments', 'id', 'name']);
			expect(call.arguments).toBe(executor.preparedExecutions[index]!.toolInput);
			expect(approvals[index]!.toolInput).toBe(call.arguments);
			expect(executor.preparedExecutions[index]!.execute).toBeFunction();
			expect(call.arguments).not.toHaveProperty('signal');
		}
		expect(batch.toolCalls[0]!.arguments).toBe(providerInputs[0]);
		const completed = originalEvents.filter((event) => event.type === 'tool.call.completed');
		expect(completed).toHaveLength(2);
		expect(completed[0]!.output).toEqual({ query: 'needle', limit: 2, matches: ['result'] });
		expect(completed[1]!.output).toMatchObject({
			cached: true,
			sourceToolCallId: batch.toolCalls[0]!.id,
		});
		expect(JSON.parse(JSON.stringify(originalEvents))).toEqual(originalEvents);
		const jsonl = await readFile(join(directory, sessionId, 'events.jsonl'), 'utf8');
		for (const runtimeKey of [
			'execution',
			'execute',
			'signal',
			'requiresApproval',
			'deduplicate',
			'invalidatesWorkspaceCache',
			'toolInputSchema',
		])
			expect(jsonl).not.toContain(`"${runtimeKey}"`);
		const freshStore = new JsonlSessionStore(directory);
		const persisted = await freshStore.readSessionEvents(sessionId);
		expect(persisted).toEqual(originalEvents);
		const replay = reduceAgentState(sessionId, persisted);
		expect(await new SessionService(freshStore).readSessionState(sessionId)).toEqual(replay);
		expect(await sessions.readSessionState(sessionId)).toEqual(replay);
		expect(model.receivedInputs[1]!.messages).toEqual(
			contextBuilder.build(reduceAgentState(sessionId, persisted.slice(0, -1))).messages,
		);
	} finally {
		await cleanup();
	}
});

describe('Phase 7 canonical request boundaries', () => {
	test('first request rebuilds existing, legacy and orphan history with the new committed prompt', async () => {
		const orphanId = asToolCallId('old-orphan');
		const model = new ScriptedModel([textResponse('Follow-up')]);
		const { useCase, sessionId, requestPrefixes, sessions, contextBuilder } =
			createRunAgentTurnHarness({
				model,
				toolExecutor: createReadToolExecutor(),
				events: [
					promptSubmittedEvent({ prompt: 'Earlier prompt' }),
					assistantMessageCompletedEvent({ content: 'Earlier answer' }),
					toolCallRequestedEvent({ toolInput: { path: 'old.txt' } }),
					toolCallCompletedEvent({ output: 'legacy output' }),
					toolCallCompletedEvent({
						id: asEventId('old-orphan-event'),
						toolCallId: orphanId,
						output: { orphan: true },
					}),
				],
			});
		const read = spyOn(sessions, 'readSessionState');
		const build = spyOn(contextBuilder, 'build');
		try {
			await collectAsyncIterable(useCase.run({ sessionId, prompt: 'New prompt' }));
			expect(requestPrefixes).toHaveLength(1);
			expect(requestPrefixes[0]!.at(-1)).toMatchObject({
				type: 'prompt.submitted',
				prompt: 'New prompt',
			});
			expect(read).toHaveBeenCalledTimes(1);
			expect(build).toHaveBeenCalledTimes(1);
			expect(model.receivedInputs[0]!.messages.map((message) => message.content)).toEqual([
				'You are a local coding agent.',
				'Earlier prompt',
				'Earlier answer',
				'',
				'legacy output',
				'{"orphan":true}',
				'New prompt',
			]);
			expect(model.receivedInputs[0]!.messages.at(-2)).toMatchObject({
				role: 'tool',
				toolCallId: orphanId,
			});
		} finally {
			read.mockRestore();
			build.mockRestore();
		}
	});

	test('awaits every terminal append before reading and building the next request', async () => {
		const terminalEntered = createDeferred<void>();
		const releaseTerminal = createDeferred<void>();
		const model = new ScriptedModel([
			toolCallResponse(
				[readFileToolCall('first.txt'), readFileToolCall('second.txt')],
				'Inspecting both.',
			),
			textResponse('Done'),
		]);
		const { useCase, sessionId, sessionStore, sessions, contextBuilder, requestPrefixes } =
			createRunAgentTurnHarness({ model, toolExecutor: createReadToolExecutor() });
		const append = sessionStore.appendSessionEvent.bind(sessionStore);
		let completions = 0;
		sessionStore.appendSessionEvent = async (event) => {
			if (event.type === 'tool.call.completed' && ++completions === 2) {
				terminalEntered.resolve();
				await releaseTerminal.promise;
			}
			await append(event);
		};
		const read = spyOn(sessions, 'readSessionState');
		const build = spyOn(contextBuilder, 'build');
		const turn = collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read both' }));
		try {
			await terminalEntered.promise;
			expect(model.receivedInputs).toHaveLength(1);
			expect(
				sessionStore.events.filter((event) => event.type === 'tool.call.completed'),
			).toHaveLength(1);
			expect(
				reduceAgentState(sessionId, JSON.parse(JSON.stringify(sessionStore.events))).messages,
			).toEqual([expect.objectContaining({ role: 'user', content: 'Read both' })]);
			expect(read).toHaveBeenCalledTimes(1);
			expect(build).toHaveBeenCalledTimes(1);
			releaseTerminal.resolve();
			await turn;
			expect(read).toHaveBeenCalledTimes(2);
			expect(build).toHaveBeenCalledTimes(2);
			expect(requestPrefixes).toHaveLength(2);
			const batch = requestPrefixes[1]!.find(
				(event) => event.type === 'assistant.tool_calls.completed',
			);
			if (batch?.type !== 'assistant.tool_calls.completed')
				throw new Error('Expected committed batch');
			expect(model.receivedInputs[1]!.messages.slice(-3)).toEqual([
				expect.objectContaining({
					role: 'assistant',
					content: 'Inspecting both.',
					toolCalls: batch.toolCalls,
				}),
				expect.objectContaining({ role: 'tool', toolCallId: batch.toolCalls[0]!.id }),
				expect.objectContaining({ role: 'tool', toolCallId: batch.toolCalls[1]!.id }),
			]);
			expect(
				requestPrefixes[1]!
					.filter((event) => event.type === 'tool.call.completed')
					.map((event) => event.toolCallId),
			).toEqual(batch.toolCalls.map((call) => call.id));
		} finally {
			releaseTerminal.resolve();
			await turn;
			read.mockRestore();
			build.mockRestore();
		}
	});

	test('fresh turn after an interrupted JSONL batch excludes its partial history without fabricating terminals', async () => {
		const { directory, cleanup } = await createTempDirectory('phase-7-interrupted-');
		try {
			const sessionId = asSessionId('session-1');
			const firstId = asToolCallId('interrupted-first');
			const secondId = asToolCallId('interrupted-second');
			const prefix = [
				promptSubmittedEvent({ prompt: 'Interrupted prompt' }),
				assistantToolCallsCompletedEvent({
					content: 'Partial batch text',
					toolCalls: [
						{ id: firstId, name: 'read_file', arguments: { path: 'first' } },
						{ id: secondId, name: 'read_file', arguments: { path: 'second' } },
					],
				}),
				toolCallRequestedEvent({ toolCallId: firstId }),
				toolCallStartedEvent({ toolCallId: firstId }),
				toolCallCompletedEvent({ toolCallId: firstId, output: 'partial result' }),
				toolCallRequestedEvent({ id: asEventId('second-request'), toolCallId: secondId }),
				toolCallStartedEvent({ id: asEventId('second-start'), toolCallId: secondId }),
			];
			const originalStore = new JsonlSessionStore(directory);
			for (const event of prefix) await originalStore.appendSessionEvent(event);
			const durable = new JsonlSessionStore(directory);
			const sessions = new SessionService(durable);
			const model = new ScriptedModel([textResponse('Resumed')]);
			const checked = checkRequestBoundaries(
				model,
				sessionId,
				() => new JsonlSessionStore(directory).readSessionEvents(sessionId),
				{ systemPrompt: 'test', maxContextCharacters: 120_000 },
				() => new SessionService(new JsonlSessionStore(directory)),
			);
			const executor = createReadToolExecutor();
			const loop = new RunAgentTurn({
				sessionStore: sessions,
				model: checked.model,
				contextBuilder: new ContextBuilder({ systemPrompt: 'test', maxContextCharacters: 120_000 }),
				toolExecutor: executor,
				clock: new FixedClock(),
				idGenerator: new SequenceIdGenerator(),
			});
			await collectAsyncIterable(loop.run({ sessionId, prompt: 'Fresh prompt' }));
			expect(checked.prefixes).toHaveLength(1);
			expect(model.receivedInputs[0]!.messages.map((message) => message.content)).toEqual([
				'test',
				'Interrupted prompt',
				'Fresh prompt',
			]);
			expect(
				model.receivedInputs[0]!.messages.some(
					(message) =>
						message.role === 'tool' ||
						(message.role === 'assistant' && message.toolCalls !== undefined),
				),
			).toBe(false);
			expect(executor.receivedRequests).toHaveLength(0);
			const persisted = await new JsonlSessionStore(directory).readSessionEvents(sessionId);
			expect(persisted.slice(0, prefix.length)).toEqual(prefix);
			expect(persisted.slice(prefix.length).map((event) => event.type)).toEqual([
				'prompt.submitted',
				'assistant.message.completed',
			]);
		} finally {
			await cleanup();
		}
	});

	test('whole-turn truncation is identical at the first and post-tool request', async () => {
		const old = 'o'.repeat(900);
		const events = [
			promptSubmittedEvent({
				id: asEventId('old-prompt'),
				messageId: asMessageId('old-user'),
				prompt: old,
			}),
			assistantMessageCompletedEvent({
				id: asEventId('old-answer'),
				messageId: asMessageId('old-assistant'),
				content: old,
			}),
			promptSubmittedEvent({
				id: asEventId('recent-prompt'),
				messageId: asMessageId('recent-user'),
				prompt: 'Recent question',
			}),
			assistantMessageCompletedEvent({
				id: asEventId('recent-answer'),
				messageId: asMessageId('recent-assistant'),
				content: 'Recent answer',
			}),
		];
		const model = new ScriptedModel([
			toolCallResponse([readFileToolCall('README.md')], 'Checking'),
			textResponse('Done'),
		]);
		const { useCase, sessionId, requestPrefixes } = createRunAgentTurnHarness({
			model,
			events,
			toolExecutor: createReadToolExecutor(),
			maxContextCharacters: 500,
		});
		await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Current question' }));
		expect(requestPrefixes).toHaveLength(2);
		for (const input of model.receivedInputs) {
			expect(input.messages.some((message) => message.content === old)).toBe(false);
			expect(input.messages.some((message) => message.content === 'Current question')).toBe(true);
			expect(JSON.stringify(input.messages).length).toBeLessThanOrEqual(500);
		}
		expect(model.receivedInputs[0]!.messages.slice(1).map((message) => message.content)).toEqual([
			'Recent question',
			'Recent answer',
			'Current question',
		]);
		expect(model.receivedInputs[1]!.messages.slice(1).map((message) => message.content)).toEqual([
			'Current question',
			'Checking',
			'{"path":"README.md","content":"hello"}',
		]);
	});

	test('normalized list calls reuse the original result across requests with fresh replay equality', async () => {
		let listings = 0;
		const registry = new LocalToolRegistry([
			defineLocalTool({
				name: 'list_files',
				description: 'List',
				inputSchema: z.strictObject({ path: z.string().trim().default('.') }),
				deduplicate: true,
				execute: async () => ({ files: [`version-${++listings}`] }),
			}),
		]);
		const executor = new RecordingToolExecutor(
			registry.listTools(),
			() => {
				throw new Error('Expected prepared execution');
			},
			(request) => registry.prepare(request),
		);
		const model = new ScriptedModel([
			toolCallResponse([toolCall('list_files', { path: ' src ' })]),
			toolCallResponse([
				toolCall('list_files', { path: 'src' }),
				toolCall('list_files', { path: 'src' }),
			]),
			textResponse('Done'),
		]);
		const { useCase, sessionId, requestPrefixes } = createRunAgentTurnHarness({
			model,
			toolExecutor: executor,
		});
		await collectAsyncIterable(useCase.run({ sessionId, prompt: 'List repeatedly' }));
		expect(requestPrefixes).toHaveLength(3);
		expect(listings).toBe(1);
		const firstBatch = requestPrefixes[1]!.find(
			(event) => event.type === 'assistant.tool_calls.completed',
		);
		if (firstBatch?.type !== 'assistant.tool_calls.completed')
			throw new Error('Expected original batch');
		const originalId = firstBatch.toolCalls[0]!.id;
		const lastMessages = model.receivedInputs[2]!.messages.slice(-3);
		expect(lastMessages[0]).toMatchObject({
			role: 'assistant',
			toolCalls: [
				{ name: 'list_files', arguments: { path: 'src' } },
				{ name: 'list_files', arguments: { path: 'src' } },
			],
		});
		for (const message of lastMessages.slice(1))
			expect(JSON.parse(message.content)).toEqual({
				cached: true,
				sourceToolCallId: originalId,
				message: `Result reused from tool call ${originalId}.`,
			});
	});

	for (const availability of ['no executor', 'empty registry'] as const) {
		for (const response of ['text', 'tool calls', 'empty'] as const) {
			test(`${availability} uses one canonical round without tools and persists ${response}`, async () => {
				const executor = new RecordingToolExecutor([], () => {
					throw new Error('Unexpected execution');
				});
				const chunks =
					response === 'empty'
						? []
						: [
								{
									contentDelta: 'Hello',
									...(response === 'tool calls'
										? { toolCalls: [toolCall('unavailable', { invalid: true })] }
										: {}),
								},
								{ contentDelta: '' },
								{ contentDelta: ' world' },
							];
				const model = new ScriptedModel([chunks]);
				const { useCase, sessionId, sessionStore, requestPrefixes, contextBuilder } =
					createRunAgentTurnHarness({
						model,
						...(availability === 'empty registry' ? { toolExecutor: executor } : {}),
					});
				const build = spyOn(contextBuilder, 'build');
				try {
					const streamed = await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Hello' }));
					expect(streamed).toEqual(
						response === 'empty' ? [] : [{ contentDelta: 'Hello' }, { contentDelta: ' world' }],
					);
					expect(model.receivedInputs).toHaveLength(1);
					expect(model.receivedInputs[0]).not.toHaveProperty('tools');
					expect(requestPrefixes).toHaveLength(1);
					expect(build).toHaveBeenCalledTimes(1);
					expect(executor.preparationRequests).toHaveLength(0);
					expect(executor.receivedRequests).toHaveLength(0);
					expect(sessionStore.events.map((event) => event.type)).toEqual([
						'prompt.submitted',
						'assistant.message.completed',
					]);
					expect(sessionStore.events.at(-1)).toMatchObject({
						content: response === 'empty' ? '' : 'Hello world',
					});
				} finally {
					build.mockRestore();
				}
			});
		}
	}

	test('failed stream after text and accumulated calls executes nothing and commits no answer', async () => {
		const executor = createReadToolExecutor();
		const model = new ScriptedModel([
			{
				chunks: [
					{ contentDelta: 'Partial ', toolCalls: [readFileToolCall('README.md')] },
					{ contentDelta: 'text' },
				],
				error: new Error('broken stream'),
			},
		]);
		const { useCase, sessionId, sessionStore } = createRunAgentTurnHarness({
			model,
			toolExecutor: executor,
		});
		const streamed: string[] = [];
		await expect(
			(async () => {
				for await (const chunk of useCase.run({ sessionId, prompt: 'Read' }))
					streamed.push(chunk.contentDelta);
			})(),
		).rejects.toThrow('broken stream');
		expect(streamed).toEqual(['Partial ', 'text']);
		expect(executor.preparationRequests).toHaveLength(0);
		expect(executor.receivedRequests).toHaveLength(0);
		expect(model.receivedInputs).toHaveLength(1);
		expect(sessionStore.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'agent.error',
		]);
		expect(sessionStore.events.at(-1)).toMatchObject({ error: { code: 'MODEL_STREAM_FAILED' } });
	});

	test('common initial context budget error reports once without duplicating the prompt or requesting the model', async () => {
		const model = new ScriptedModel([textResponse('unused')]);
		const { useCase, sessionId, sessionStore, contextBuilder } = createRunAgentTurnHarness({
			model,
		});
		const cause = new ContextBudgetExceededError(120);
		const build = spyOn(contextBuilder, 'build').mockImplementation(() => {
			throw cause;
		});
		try {
			await expect(
				collectAsyncIterable(useCase.run({ sessionId, prompt: 'Fits preflight' })),
			).rejects.toBe(cause);
			expect(build).toHaveBeenCalledTimes(1);
			expect(model.receivedInputs).toHaveLength(0);
			expect(sessionStore.events.map((event) => event.type)).toEqual([
				'prompt.submitted',
				'agent.error',
			]);
			expect(sessionStore.events.at(-1)).toMatchObject({
				error: { code: 'CONTEXT_BUDGET_EXCEEDED' },
			});
		} finally {
			build.mockRestore();
		}
	});

	test('round twelve can finish with text after eleven tool batches', async () => {
		const executor = createReadToolExecutor();
		const model = new ScriptedModel([
			...Array.from({ length: 11 }, () => toolCallResponse([readFileToolCall('README.md')])),
			textResponse('Finished on twelve'),
		]);
		const { useCase, sessionId, sessionStore, requestPrefixes } = createRunAgentTurnHarness({
			model,
			toolExecutor: executor,
		});
		expect(await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Read' }))).toEqual([
			{ contentDelta: 'Finished on twelve' },
		]);
		expect(model.receivedInputs).toHaveLength(12);
		expect(requestPrefixes).toHaveLength(12);
		expect(executor.receivedRequests).toHaveLength(11);
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'assistant.message.completed',
			content: 'Finished on twelve',
		});
		expect(sessionStore.events.filter((event) => event.type === 'agent.error')).toEqual([]);
	});

	test('twelve tool rounds with multiple calls commit all results then stop without a thirteenth request', async () => {
		const executor = createReadToolExecutor();
		const model = new ScriptedModel(
			Array.from({ length: 13 }, () =>
				toolCallResponse([readFileToolCall('first'), readFileToolCall('second')]),
			),
		);
		const { useCase, sessionId, sessionStore, requestPrefixes } = createRunAgentTurnHarness({
			model,
			toolExecutor: executor,
		});
		await expect(
			collectAsyncIterable(useCase.run({ sessionId, prompt: 'Keep reading' })),
		).rejects.toThrow('Tool iteration limit reached.');
		expect(model.receivedInputs).toHaveLength(12);
		expect(requestPrefixes).toHaveLength(12);
		expect(executor.receivedRequests).toHaveLength(24);
		expect(
			sessionStore.events.filter((event) => event.type === 'assistant.tool_calls.completed'),
		).toHaveLength(12);
		expect(
			sessionStore.events.filter((event) => event.type === 'tool.call.completed'),
		).toHaveLength(24);
		expect(
			sessionStore.events.filter((event) => event.type === 'assistant.message.completed'),
		).toHaveLength(0);
		expect(sessionStore.events.at(-1)).toMatchObject({
			type: 'agent.error',
			error: { code: 'TOOL_ITERATION_LIMIT_REACHED' },
		});
	});
});

test('explicit denial closes all calls and ends the turn; a follow-up sees identical durable denial and cancellation history', async () => {
	const executor = createReadEditToolExecutor();
	const model = new ScriptedModel([
		toolCallResponse([editFileToolCall(), readFileToolCall('later')], 'Proposed edit'),
		textResponse('Follow-up answer'),
	]);
	const { useCase, sessionId, sessionStore, requestPrefixes } = createRunAgentTurnHarness({
		model,
		toolExecutor: executor,
		approveToolCall: async () => false,
	});
	const terminal = 'Tool call was not approved: edit_file';
	expect(await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Edit' }))).toEqual([
		{ contentDelta: 'Proposed edit' },
		{ contentDelta: terminal },
	]);
	expect(model.receivedInputs).toHaveLength(1);
	expect(executor.receivedRequests).toHaveLength(0);
	const failures = sessionStore.events.filter((event) => event.type === 'tool.call.failed');
	expect(failures.map((event) => event.error.code)).toEqual([
		'TOOL_APPROVAL_DENIED',
		'TOOL_BATCH_CANCELLED',
	]);
	expect(sessionStore.events.at(-1)).toMatchObject({
		type: 'assistant.message.completed',
		content: terminal,
	});
	await collectAsyncIterable(useCase.run({ sessionId, prompt: 'Explain denial' }));
	expect(requestPrefixes).toHaveLength(2);
	const toolResults = model.receivedInputs[1]!.messages.filter(
		(message) => message.role === 'tool',
	);
	expect(toolResults.map((message) => message.toolCallId)).toEqual(
		failures.map((event) => event.toolCallId),
	);
	expect(toolResults.map((message) => JSON.parse(message.content))).toEqual(
		failures.map((event) => ({ error: { message: event.error.message } })),
	);
	expect(model.receivedInputs[1]!.messages.at(-2)).toMatchObject({
		role: 'assistant',
		content: terminal,
	});
	expect(executor.receivedRequests).toHaveLength(0);
});
