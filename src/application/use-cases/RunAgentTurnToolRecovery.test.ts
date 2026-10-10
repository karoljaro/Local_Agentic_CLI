import { describe, expect, spyOn, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelChatInput, ModelPort, ModelStreamChunk } from '@/application/ports/ModelPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { SessionService } from '@/application/services/SessionService';
import type { ToolApprovalRequest } from '@/application/services/ToolRunner';
import { readConfig } from '@/composition/config';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asISODateTime, asSessionId } from '@/domain/Ids';
import type { ModelToolCall } from '@/domain/Tool';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { RecordingToolExecutor } from '@/test-support/RecordingToolExecutor';
import { TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { RunAgentTurn } from './RunAgentTurn';

const sessionId = asSessionId('tool-recovery');
const original = 'print("hello")\n';
const replacement = 'print("hello, world")\n';
const call = (name: string, args: unknown): ModelToolCall => ({ name, arguments: args });
const calls = (...toolCalls: ModelToolCall[]): ModelStreamChunk => ({
	contentDelta: '',
	toolCalls,
});
const final: ModelStreamChunk = { contentDelta: 'Updated mini_cli.py.' };
const toolResults = (input: ModelChatInput) =>
	input.messages
		.filter((message) => message.role === 'tool')
		.map((message) => JSON.parse(message.content));
const assistantCalls = (input: ModelChatInput) =>
	input.messages.flatMap((message) =>
		message.role === 'assistant' ? (message.toolCalls ?? []) : [],
	);

const fixture = async (options: { allow?: boolean } = {}) => {
	const temp = await createTempDirectory('phase18.1-recovery-');
	await writeFile(join(temp.directory, 'mini_cli.py'), original);
	const registry = createLocalToolExecutor({ workspaceRoot: temp.directory });
	const executor = new RecordingToolExecutor(
		registry.listTools(),
		() => {
			throw new Error('Raw execution must not be used.');
		},
		(request) => registry.prepare(request),
	);
	const store = new InMemorySessionStore();
	const service = new SessionService(store);
	const requests: ModelChatInput[] = [];
	const approvals: ToolApprovalRequest[] = [];
	return {
		...temp,
		registry,
		executor,
		store,
		requests,
		approvals,
		turn: (
			respond: (
				input: ModelChatInput,
				round: number,
			) => ModelStreamChunk | Promise<ModelStreamChunk>,
		) => {
			const model: ModelPort = {
				async *streamChat(input) {
					requests.push(input);
					expect(input.messages.slice(1)).toEqual(
						(await service.readSessionState(sessionId)).messages,
					);
					yield await respond(input, requests.length - 1);
				},
			};
			return new RunAgentTurn({
				sessionStore: service,
				model,
				toolExecutor: executor,
				contextBuilder: new ContextBuilder({
					systemPrompt: readConfig({}).SYSTEM_PROMPT,
					contextProfile: TEST_CONTEXT_PROFILE,
				}),
				clock: { now: () => asISODateTime('2026-10-10T12:00:00Z') },
				idGenerator: new BunUuidV7IdGenerator(),
				approveToolCall: async (request) => {
					approvals.push(request);
					return options.allow !== false;
				},
			});
		},
	};
};

describe('recoverable tool schema failures through the real loop and filesystem', () => {
	test('rejected raw arguments are snapshotted before asynchronous persistence', async () => {
		const f = await fixture();
		const args = { path: 'mini_cli.py', content: replacement, expectedVersion: 'not-a-version' };
		const supplied = structuredClone(args);
		const append = f.store.appendSessionEvent.bind(f.store);
		const recording = spyOn(f.store, 'appendSessionEvent').mockImplementation(async (event) => {
			if (event.type === 'assistant.tool_calls.completed') {
				args.path = 'different.py';
				args.expectedVersion = 'a'.repeat(64);
			}
			await append(event);
		});
		try {
			const turn = f.turn((input, round) => {
				if (round === 0) return calls(call('replace_file', args));
				expect(assistantCalls(input)[0]?.arguments).toEqual(supplied);
				expect(toolResults(input).at(-1).error.message).toContain('expectedVersion');
				return { contentDelta: 'The invalid version was not-a-version.' };
			});
			await collectAsyncIterable(turn.run({ sessionId, prompt: 'Improve mini_cli.py.' }));
			expect(f.requests).toHaveLength(2);
			expect(
				f.store.events
					.filter((event) => event.type === 'tool.call.requested')
					.map((event) => event.toolInput),
			).toEqual([supplied]);
			expect(f.executor.receivedRequests).toEqual([]);
			expect(f.approvals).toEqual([]);
		} finally {
			recording.mockRestore();
			await f.cleanup();
		}
	});
	for (const expectedVersion of ['not-a-version', undefined]) {
		test(`returns ${expectedVersion === undefined ? 'missing' : 'malformed'} version feedback and accepts an explicit read-derived retry`, async () => {
			const f = await fixture();
			try {
				const args = {
					path: 'mini_cli.py',
					content: replacement,
					...(expectedVersion === undefined ? {} : { expectedVersion }),
				};
				const turn = f.turn(async (input, round) => {
					if (round === 0) return calls(call('replace_file', args));
					if (round === 1) {
						const error = toolResults(input).at(-1).error.message;
						expect(error).toContain('Invalid arguments for tool replace_file');
						expect(error).toContain('expectedVersion');
						expect(error).toContain(
							expectedVersion === undefined ? 'expected string' : '/^[a-f0-9]{64}$/',
						);
						expect(error).not.toMatch(/\bat .*\.ts:\d|stack/i);
						expect(assistantCalls(input)[0]?.arguments).toEqual(args);
						expect(f.executor.receivedRequests).toEqual([]);
						expect(f.approvals).toEqual([]);
						expect(await readFile(join(f.directory, 'mini_cli.py'), 'utf8')).toBe(original);
						return calls(call('read_file', { path: 'mini_cli.py' }));
					}
					if (round === 2) {
						const read = toolResults(input).at(-1);
						expect(read.content).toBe(original);
						expect(read.version).toMatch(/^[a-f0-9]{64}$/);
						return calls(call('replace_file', { ...args, expectedVersion: read.version }));
					}
					expect(round).toBe(3);
					expect(toolResults(input).at(-1)).toEqual({ path: 'mini_cli.py', changed: true });
					return final;
				});
				await collectAsyncIterable(
					turn.run({ sessionId, prompt: 'Upgrade mini_cli.py. You can choose.' }),
				);
				expect(f.requests).toHaveLength(4);
				expect(f.executor.preparationRequests.map((request) => request.toolName)).toEqual([
					'replace_file',
					'read_file',
					'replace_file',
				]);
				expect(f.executor.receivedRequests.map((request) => request.toolName)).toEqual([
					'read_file',
					'replace_file',
				]);
				expect(f.approvals).toHaveLength(1);
				expect(f.approvals[0]!.toolInput).toEqual(f.executor.receivedRequests[1]!.toolInput);
				expect(f.store.events.filter((event) => event.type === 'agent.error')).toEqual([]);
				expect(f.store.events.filter((event) => event.type === 'tool.call.failed')).toMatchObject([
					{ error: { code: 'TOOL_ARGUMENTS_INVALID' } },
				]);
				expect(await readFile(join(f.directory, 'mini_cli.py'), 'utf8')).toBe(replacement);
			} finally {
				await f.cleanup();
			}
		});
	}

	test('valid siblings of invalid calls never execute; every rejected call receives truthful feedback', async () => {
		const f = await fixture();
		try {
			const proposed = [
				call('create_file', { path: ' sibling.py ', content: original }),
				call('replace_file', {
					path: 'mini_cli.py',
					content: replacement,
					expectedVersion: 'invalid',
				}),
				call('edit_file', { path: 'mini_cli.py', edits: [] }),
				call('read_file', { path: 'mini_cli.py' }),
			];
			const turn = f.turn(async (input, round) => {
				if (round === 0) return calls(...proposed);
				if (round === 1) {
					expect(f.executor.preparationRequests).toHaveLength(4);
					expect(f.executor.receivedRequests).toEqual([]);
					expect(f.approvals).toEqual([]);
					expect(f.store.events.some((event) => event.type === 'tool.call.started')).toBe(false);
					await expect(readFile(join(f.directory, 'sibling.py'), 'utf8')).rejects.toHaveProperty(
						'code',
						'ENOENT',
					);
					const errors = toolResults(input).map((result) => result.error.message);
					expect(errors).toHaveLength(4);
					expect(errors[0]).toContain('not executed');
					expect(errors[1]).toContain('expectedVersion');
					expect(errors[2]).toContain('edits');
					expect(errors[3]).toContain('not executed');
					const batch = assistantCalls(input);
					expect(batch.map(({ name, arguments: args }) => ({ name, arguments: args }))).toEqual(
						proposed,
					);
					return calls(
						call('edit_file', {
							path: 'mini_cli.py',
							edits: [{ oldText: original, newText: replacement }],
						}),
					);
				}
				expect(round).toBe(2);
				return final;
			});
			await collectAsyncIterable(turn.run({ sessionId, prompt: 'Improve mini_cli.py.' }));
			expect(f.executor.receivedRequests.map((request) => request.toolName)).toEqual(['edit_file']);
			expect(f.approvals).toHaveLength(1);
			expect(
				f.store.events
					.filter((event) => event.type === 'tool.call.failed')
					.map((event) => event.error.code),
			).toEqual([
				'TOOL_BATCH_CANCELLED',
				'TOOL_ARGUMENTS_INVALID',
				'TOOL_ARGUMENTS_INVALID',
				'TOOL_BATCH_CANCELLED',
			]);
			expect(await readFile(join(f.directory, 'mini_cli.py'), 'utf8')).toBe(replacement);
		} finally {
			await f.cleanup();
		}
	});

	test('a just-created small file can be edited exactly without a redundant read', async () => {
		const f = await fixture();
		try {
			const turn = f.turn((_input, round) => {
				if (round === 0) return calls(call('create_file', { path: 'new.py', content: original }));
				if (round === 1)
					return calls(
						call('edit_file', {
							path: 'new.py',
							edits: [{ oldText: original, newText: replacement }],
						}),
					);
				return final;
			});
			await collectAsyncIterable(
				turn.run({
					sessionId,
					prompt: 'Create a small Python file and add a greeting improvement.',
				}),
			);
			expect(f.executor.receivedRequests.map((request) => request.toolName)).toEqual([
				'create_file',
				'edit_file',
			]);
			expect(f.approvals).toHaveLength(2);
			expect(await readFile(join(f.directory, 'new.py'), 'utf8')).toBe(replacement);
		} finally {
			await f.cleanup();
		}
	});

	test('repeated malformed calls exhaust the existing bound without mutations or approvals', async () => {
		const f = await fixture();
		try {
			const turn = f.turn(() =>
				calls(
					call('replace_file', {
						path: 'mini_cli.py',
						content: replacement,
						expectedVersion: 'invalid',
					}),
				),
			);
			await expect(
				collectAsyncIterable(turn.run({ sessionId, prompt: 'Improve mini_cli.py.' })),
			).rejects.toThrow('Tool iteration limit reached.');
			expect(f.requests).toHaveLength(12);
			expect(f.store.events.filter((event) => event.type === 'tool.call.failed')).toHaveLength(12);
			expect(f.executor.receivedRequests).toEqual([]);
			expect(f.approvals).toEqual([]);
			expect(f.store.events.at(-1)).toMatchObject({
				type: 'agent.error',
				error: { code: 'TOOL_ITERATION_LIMIT_REACHED' },
			});
			expect(await readFile(join(f.directory, 'mini_cli.py'), 'utf8')).toBe(original);
		} finally {
			await f.cleanup();
		}
	});

	test('corrected schema calls still require approval and a denial remains terminal', async () => {
		const f = await fixture({ allow: false });
		try {
			const turn = f.turn((_input, round) => {
				if (round === 0) return calls(call('edit_file', { path: 'mini_cli.py', edits: [] }));
				if (round === 1)
					return calls(
						call('edit_file', {
							path: 'mini_cli.py',
							edits: [{ oldText: original, newText: replacement }],
						}),
					);
				throw new Error('No model retry after approval denial.');
			});
			await collectAsyncIterable(turn.run({ sessionId, prompt: 'Improve mini_cli.py.' }));
			expect(f.requests).toHaveLength(2);
			expect(f.approvals).toHaveLength(1);
			expect(f.executor.receivedRequests).toEqual([]);
			expect(f.store.events.at(-1)).toMatchObject({
				type: 'assistant.message.completed',
				content: 'Tool call was not approved: edit_file',
			});
			expect(await readFile(join(f.directory, 'mini_cli.py'), 'utf8')).toBe(original);
		} finally {
			await f.cleanup();
		}
	});

	test('a later unknown tool keeps the batch terminal, even after a typed schema failure', async () => {
		const f = await fixture();
		try {
			const turn = f.turn(() =>
				calls(call('edit_file', { path: 'mini_cli.py', edits: [] }), call('unknown', {})),
			);
			await expect(
				collectAsyncIterable(turn.run({ sessionId, prompt: 'Improve mini_cli.py.' })),
			).rejects.toThrow('Unknown tool requested by model: unknown');
			expect(f.requests).toHaveLength(1);
			expect(f.store.events.map((event) => event.type)).toEqual([
				'prompt.submitted',
				'agent.error',
			]);
			expect(f.executor.receivedRequests).toEqual([]);
			expect(f.approvals).toEqual([]);
		} finally {
			await f.cleanup();
		}
	});

	test('an arbitrary preparation error with validation-like wording remains terminal', async () => {
		const f = await fixture();
		const cause = new Error(
			'Invalid arguments for tool edit_file: provider preparation unavailable',
		);
		const prepare = spyOn(f.registry, 'prepare').mockImplementation(() => {
			throw cause;
		});
		try {
			const turn = f.turn(() => calls(call('edit_file', { path: 'mini_cli.py', edits: [] })));
			await expect(
				collectAsyncIterable(turn.run({ sessionId, prompt: 'Improve mini_cli.py.' })),
			).rejects.toBe(cause);
			expect(f.requests).toHaveLength(1);
			expect(f.store.events.map((event) => event.type)).toEqual([
				'prompt.submitted',
				'agent.error',
			]);
			expect(f.executor.receivedRequests).toEqual([]);
		} finally {
			prepare.mockRestore();
			await f.cleanup();
		}
	});

	test('cancellation after validation feedback prevents another model round or any mutation', async () => {
		const f = await fixture();
		const controller = new AbortController();
		const append = f.store.appendSessionEvent.bind(f.store);
		const recording = spyOn(f.store, 'appendSessionEvent').mockImplementation(async (event) => {
			await append(event);
			if (event.type === 'tool.call.failed') controller.abort();
		});
		try {
			const turn = f.turn(() => calls(call('edit_file', { path: 'mini_cli.py', edits: [] })));
			await expect(
				collectAsyncIterable(
					turn.run({ sessionId, prompt: 'Improve mini_cli.py.', signal: controller.signal }),
				),
			).rejects.toHaveProperty('name', 'AbortError');
			expect(f.requests).toHaveLength(1);
			expect(f.executor.receivedRequests).toEqual([]);
			expect(f.approvals).toEqual([]);
			expect(f.store.events.some((event) => event.type === 'tool.call.started')).toBe(false);
			expect(await readFile(join(f.directory, 'mini_cli.py'), 'utf8')).toBe(original);
		} finally {
			recording.mockRestore();
			await f.cleanup();
		}
	});

	test('validation-feedback persistence failure retains its cause and never requests recovery', async () => {
		const f = await fixture();
		const cause = new Error('validation feedback storage unavailable');
		const append = f.store.appendSessionEvent.bind(f.store);
		const recording = spyOn(f.store, 'appendSessionEvent').mockImplementation(async (event) => {
			if (event.type === 'tool.call.failed') throw cause;
			await append(event);
		});
		try {
			const turn = f.turn(() => calls(call('edit_file', { path: 'mini_cli.py', edits: [] })));
			await expect(
				collectAsyncIterable(turn.run({ sessionId, prompt: 'Improve mini_cli.py.' })),
			).rejects.toBe(cause);
			expect(f.requests).toHaveLength(1);
			expect(f.executor.receivedRequests).toEqual([]);
			expect(f.approvals).toEqual([]);
			expect(await readFile(join(f.directory, 'mini_cli.py'), 'utf8')).toBe(original);
		} finally {
			recording.mockRestore();
			await f.cleanup();
		}
	});
});
