import { describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ToolExecutorPort } from '@/application/ports/ToolExecutorPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { SessionService } from '@/application/services/SessionService';
import { readConfig } from '@/composition/config';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asISODateTime, asSessionId } from '@/domain/Ids';
import { toOllamaTool } from '@/infrastructure/model/mappers/OllamaChatMapper';
import { OllamaModelAdapter } from '@/infrastructure/model/OllamaModelAdapter';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { withMockedFetch } from '@/test-support/withMockedFetch';
import { RunAgentTurn, type ToolApprovalRequest } from './RunAgentTurn';

const nativeCall = (name: string, args: unknown, index = 0) => ({
	id: `call_provider_${index}`,
	function: { index, name, arguments: args },
});
const nativeResponse = (calls: unknown[], content = '', doneReason = 'stop') =>
	Response.json({
		message: { role: 'assistant', content, tool_calls: calls },
		done: true,
		done_reason: doneReason,
	});
const textResponse = (content: string) => nativeResponse([], content);

const harness = async (requireReadApproval = false) => {
	const temp = await createTempDirectory('native-tool-contract-');
	const value = 'NATIVE_DETERMINISTIC_VALUE_4981';
	await writeFile(join(temp.directory, 'example.txt'), value);
	const config = readConfig({});
	const registry = createLocalToolExecutor({ workspaceRoot: temp.directory });
	const store = new InMemorySessionStore();
	const sessions = new SessionService(store);
	const approvals: ToolApprovalRequest[] = [];
	const preparations: string[] = [];
	const executions: string[] = [];
	const trace: string[] = [];
	sessions.subscribe((event) => {
		trace.push(event.type);
	});
	const executor: ToolExecutorPort = {
		listTools: () => registry.listTools(),
		prepare(request) {
			preparations.push(request.toolName);
			trace.push('prepare');
			const prepared = registry.prepare(request);
			return {
				...prepared,
				// Only this fixture exercises approval on a harmless prepared read.
				// The production read and all model-visible definitions stay unchanged.
				requiresApproval: prepared.requiresApproval || requireReadApproval,
				execute: async (options) => {
					executions.push(prepared.toolName);
					trace.push('execute');
					return prepared.execute(options);
				},
			};
		},
		execute: async () => {
			throw new Error('Unprepared execution must never be used.');
		},
	};
	const turn = new RunAgentTurn({
		sessionStore: sessions,
		model: new OllamaModelAdapter(
			config.OLLAMA_BASE_URL,
			SYNTHETIC_MODEL,
			config.OLLAMA_KEEP_ALIVE,
		),
		toolExecutor: executor,
		contextBuilder: new ContextBuilder({
			systemPrompt: config.SYSTEM_PROMPT,
			contextProfile: {
				contextWindowTokens: config.MODEL_CONTEXT_TOKENS,
				maxOutputTokens: config.MODEL_MAX_OUTPUT_TOKENS,
			},
		}),
		clock: { now: () => asISODateTime('2026-10-12T10:00:00.000Z') },
		idGenerator: new BunUuidV7IdGenerator(),
		approveToolCall: async (request) => {
			approvals.push(request);
			trace.push('approval');
			return true;
		},
	});
	return {
		...temp,
		value,
		config,
		registry,
		store,
		approvals,
		preparations,
		executions,
		trace,
		run: () =>
			collectAsyncIterable(
				turn.run({
					sessionId: asSessionId('native-fixture'),
					prompt: 'Read example.txt using workspace tools.',
				}),
			),
	};
};

describe('native provider calls through production orchestration', () => {
	for (const requireReadApproval of [false, true]) {
		test(`native read uses prepared execution, canonical IDs/results and next round (approval fixture: ${requireReadApproval})`, async () => {
			const h = await harness(requireReadApproval);
			let requests = 0;
			try {
				await withMockedFetch(async (_url, init) => {
					const body = JSON.parse(String(init?.body));
					expect(body.model).toBe(SYNTHETIC_MODEL);
					expect(body.tools).toEqual(h.registry.listTools().map(toOllamaTool));
					expect(body.tools).toHaveLength(10);
					expect(body.messages[0]).toEqual({ role: 'system', content: h.config.SYSTEM_PROMPT });
					expect(body).not.toHaveProperty('tool_choice');
					if (++requests === 1) {
						return nativeResponse(
							[nativeCall('read_file', { path: ' example.txt ' })],
							'Reading the file.',
						);
					}
					expect(requests).toBe(2);
					const completed = h.store.events.find((event) => event.type === 'tool.call.completed');
					if (completed === undefined) throw new Error('Expected canonical tool result.');
					expect(body.messages.at(-1)).toEqual({
						role: 'tool',
						tool_name: 'read_file',
						content: JSON.stringify(completed.output),
					});
					expect(body.messages.at(-2)).toEqual({
						role: 'assistant',
						content: 'Reading the file.',
						tool_calls: [{ function: { name: 'read_file', arguments: { path: 'example.txt' } } }],
					});
					expect(JSON.parse(body.messages.at(-1).content)).toMatchObject({
						path: 'example.txt',
						content: h.value,
						truncated: false,
					});
					return textResponse(h.value);
				}, h.run);
				expect(requests).toBe(2);
				expect(h.preparations).toEqual(['read_file']);
				expect(h.executions).toEqual(['read_file']);
				const batch = h.store.events.find(
					(event) => event.type === 'assistant.tool_calls.completed',
				);
				if (batch === undefined) throw new Error('Expected native batch.');
				const callId = batch.toolCalls[0]!.id;
				expect(callId).toBeString();
				expect(callId).not.toBe('call_provider_0');
				expect(
					h.store.events.filter((event) => 'toolCallId' in event).map((event) => event.toolCallId),
				).toEqual([callId, callId, callId]);
				expect(h.store.events.find((event) => event.type === 'tool.call.requested')).toMatchObject({
					toolInput: { path: 'example.txt' },
					approvalRequired: requireReadApproval,
				});
				expect(h.approvals).toEqual(
					requireReadApproval
						? [
								{
									sessionId: asSessionId('native-fixture'),
									toolCallId: callId,
									toolName: 'read_file',
									toolInput: { path: 'example.txt' },
								},
							]
						: [],
				);
				expect(h.trace).toEqual([
					'prompt.submitted',
					'prepare',
					'assistant.tool_calls.completed',
					'tool.call.requested',
					...(requireReadApproval ? ['approval'] : []),
					'tool.call.started',
					'execute',
					'tool.call.completed',
					'assistant.message.completed',
				]);
				expect(h.store.events.at(-1)).toMatchObject({
					type: 'assistant.message.completed',
					content: h.value,
				});
			} finally {
				await h.cleanup();
			}
		});
	}

	for (const content of [
		'read_file[ARGS]{"path":"example.txt"}',
		'{"name":"read_file","arguments":{"path":"example.txt"}}',
	]) {
		test(`tool-looking assistant text has zero authority: ${content}`, async () => {
			const h = await harness();
			let requests = 0;
			try {
				await withMockedFetch(async () => {
					requests++;
					return textResponse(content);
				}, h.run);
				expect(requests).toBe(1);
				expect(h.store.events.map((event) => event.type)).toEqual([
					'prompt.submitted',
					'assistant.message.completed',
				]);
				expect(h.store.events.at(-1)).toMatchObject({ content });
				expect(h.preparations).toEqual([]);
				expect(h.approvals).toEqual([]);
				expect(h.executions).toEqual([]);
			} finally {
				await h.cleanup();
			}
		});
	}

	test('native encoding still rejects the complete batch on invalid schema input before approval or execution', async () => {
		const h = await harness(true);
		let requests = 0;
		try {
			await withMockedFetch(
				async () =>
					++requests === 1
						? nativeResponse([
								nativeCall('read_file', { path: 'example.txt' }),
								nativeCall('read_file', { path: 42 }, 1),
							])
						: textResponse('Invalid input; no read executed.'),
				h.run,
			);
			expect(requests).toBe(2);
			expect(h.preparations).toEqual(['read_file', 'read_file']);
			expect(h.approvals).toEqual([]);
			expect(h.executions).toEqual([]);
			expect(h.store.events.filter((event) => event.type === 'tool.call.started')).toEqual([]);
			expect(
				h.store.events
					.filter((event) => event.type === 'tool.call.failed')
					.map((event) => event.error.code),
			).toEqual(['TOOL_BATCH_CANCELLED', 'TOOL_ARGUMENTS_INVALID']);
		} finally {
			await h.cleanup();
		}
	});

	for (const [name, response, errorCode] of [
		[
			'unknown native name',
			() => nativeResponse([nativeCall('unknown_tool', {})]),
			'MODEL_TOOL_CALL_INVALID',
		],
		[
			'length terminal with native call',
			() => nativeResponse([nativeCall('read_file', { path: 'example.txt' })], '', 'length'),
			'MODEL_OUTPUT_TRUNCATED',
		],
	] as const) {
		test(`${name} cannot approve or execute`, async () => {
			const h = await harness(true);
			let requests = 0;
			try {
				await withMockedFetch(
					async () => {
						requests++;
						return response();
					},
					async () => {
						await expect(h.run()).rejects.toThrow();
					},
				);
				expect(requests).toBe(1);
				expect(h.approvals).toEqual([]);
				expect(h.executions).toEqual([]);
				expect(h.store.events.filter((event) => event.type.startsWith('tool.'))).toEqual([]);
				expect(h.store.events.at(-1)).toMatchObject({
					type: 'agent.error',
					error: { code: errorCode },
				});
			} finally {
				await h.cleanup();
			}
		});
	}
});
