import { describe, expect, test } from 'bun:test';
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
import { PROCESS_FIXTURE_NAME, writeProcessFixture } from '@/test-support/processFixture';
import { RunAgentTurn } from './RunAgentTurn';

const sessionId = asSessionId('phase19-recovery');
const call = (name: string, args: unknown): ModelToolCall => ({ name, arguments: args });
const processInput = { program: 'bun', args: [PROCESS_FIXTURE_NAME, 'success'] };
const calls = (...toolCalls: ModelToolCall[]): ModelStreamChunk => ({
	contentDelta: '',
	toolCalls,
});
const toolResults = (input: ModelChatInput): Record<string, unknown>[] =>
	input.messages
		.filter((message) => message.role === 'tool')
		.map((message) => JSON.parse(message.content));
const fixture = async (allow = true) => {
	const temp = await createTempDirectory('phase19-recovery-');
	await writeProcessFixture(temp.directory);
	const registry = createLocalToolExecutor({ workspaceRoot: temp.directory });
	const executor = new RecordingToolExecutor(
		registry.listTools(),
		() => {
			throw new Error('Raw execution is forbidden.');
		},
		(request) => registry.prepare(request),
	);
	const store = new InMemorySessionStore();
	const service = new SessionService(store);
	const requests: ModelChatInput[] = [];
	const approvals: ToolApprovalRequest[] = [];
	return {
		...temp,
		store,
		requests,
		approvals,
		executor,
		turn: (respond: (input: ModelChatInput, round: number) => ModelStreamChunk) => {
			// Scripted fixture only; this makes zero inference/network requests.
			const model: ModelPort = {
				async *streamChat(input) {
					requests.push(input);
					yield respond(input, requests.length - 1);
				},
			};
			return new RunAgentTurn({
				model,
				sessionStore: service,
				toolExecutor: executor,
				contextBuilder: new ContextBuilder({
					systemPrompt: readConfig({}).SYSTEM_PROMPT,
					contextProfile: TEST_CONTEXT_PROFILE,
				}),
				clock: { now: () => asISODateTime('2026-10-11T12:00:00Z') },
				idGenerator: new BunUuidV7IdGenerator(),
				approveToolCall: async (request) => {
					approvals.push(request);
					return allow;
				},
			});
		},
	};
};

describe('process recovery uses the generic agent loop without inference', () => {
	test('malformed arguments get typed feedback and an explicit corrected call executes once', async () => {
		const f = await fixture();
		try {
			const turn = f.turn((input, round) => {
				if (round === 0) return calls(call('run_process', { ...processInput, timeoutMs: 0 }));
				if (round === 1) {
					expect(JSON.stringify(toolResults(input))).toContain(
						'Invalid arguments for tool run_process',
					);
					return calls(call('run_process', processInput));
				}
				expect(toolResults(input).at(-1)).toMatchObject({ exitCode: 0, stdout: 'stdout ok\n' });
				return { contentDelta: 'Checked.' };
			});
			await collectAsyncIterable(turn.run({ sessionId, prompt: 'Check the disposable helper.' }));
			expect(f.requests).toHaveLength(3);
			expect(f.executor.receivedRequests).toHaveLength(1);
			expect(f.approvals).toHaveLength(1);
			expect(f.store.events.filter((event) => event.type === 'tool.call.failed')).toMatchObject([
				{ error: { code: 'TOOL_ARGUMENTS_INVALID' } },
			]);
		} finally {
			await f.cleanup();
		}
	});
	test('a malformed file sibling cancels a valid process; only an explicit subsequent call executes', async () => {
		const f = await fixture();
		try {
			const turn = f.turn((input, round) => {
				if (round === 0)
					return calls(
						call('run_process', processInput),
						call('create_file', { path: 'never-created' }),
					);
				if (round === 1) {
					expect(f.executor.receivedRequests).toEqual([]);
					expect(f.approvals).toEqual([]);
					expect(JSON.stringify(toolResults(input))).toContain(
						'another call in this batch has invalid arguments',
					);
					return calls(call('run_process', processInput));
				}
				return { contentDelta: 'Checked.' };
			});
			await collectAsyncIterable(turn.run({ sessionId, prompt: 'Check the disposable helper.' }));
			expect(f.executor.receivedRequests).toHaveLength(1);
			expect(f.approvals).toHaveLength(1);
			expect(
				f.store.events
					.filter((event) => event.type === 'tool.call.failed')
					.map((event) => event.error.code),
			).toEqual(['TOOL_BATCH_CANCELLED', 'TOOL_ARGUMENTS_INVALID']);
		} finally {
			await f.cleanup();
		}
	});
	test('a real spawn failure is model-visible without a fake exit code or hidden fallback', async () => {
		const f = await fixture();
		try {
			const turn = f.turn((input, round) => {
				if (round === 0)
					return calls(
						call('run_process', { program: 'phase19-definitely-missing-executable-a56a12' }),
					);
				expect(toolResults(input).at(-1)).toEqual({
					error: {
						message:
							'Process could not start (ENOENT): phase19-definitely-missing-executable-a56a12',
					},
				});
				return { contentDelta: 'The requested executable could not start.' };
			});
			await collectAsyncIterable(turn.run({ sessionId, prompt: 'Run the missing helper.' }));
			expect(f.requests).toHaveLength(2);
			expect(f.executor.receivedRequests).toHaveLength(1);
			expect(f.approvals).toHaveLength(1);
			expect(f.store.events.filter((event) => event.type === 'tool.call.failed')).toMatchObject([
				{ error: { code: 'TOOL_FAILED' } },
			]);
			expect(f.store.events.some((event) => event.type === 'tool.call.completed')).toBe(false);
		} finally {
			await f.cleanup();
		}
	});
	test('a real non-zero exit remains a completed result for the next model round', async () => {
		const f = await fixture();
		try {
			const turn = f.turn((input, round) => {
				if (round === 0)
					return calls(
						call('run_process', { program: 'bun', args: [PROCESS_FIXTURE_NAME, 'failure'] }),
					);
				expect(toolResults(input).at(-1)).toMatchObject({
					exitCode: 7,
					stderr: 'stderr failure\n',
					timedOut: false,
				});
				return { contentDelta: 'The helper returned 7.' };
			});
			await collectAsyncIterable(turn.run({ sessionId, prompt: 'Run the failing helper.' }));
			expect(f.executor.receivedRequests).toHaveLength(1);
			expect(f.store.events.some((event) => event.type === 'tool.call.failed')).toBe(false);
		} finally {
			await f.cleanup();
		}
	});
	test('process approval denial remains terminal, with no execution or alternative model round', async () => {
		const f = await fixture(false);
		try {
			const turn = f.turn(() => calls(call('run_process', processInput)));
			await collectAsyncIterable(turn.run({ sessionId, prompt: 'Check the disposable helper.' }));
			expect(f.requests).toHaveLength(1);
			expect(f.executor.receivedRequests).toEqual([]);
			expect(f.approvals).toHaveLength(1);
			expect(f.store.events.filter((event) => event.type === 'tool.call.failed')).toMatchObject([
				{ error: { code: 'TOOL_APPROVAL_DENIED' } },
			]);
		} finally {
			await f.cleanup();
		}
	});
});
