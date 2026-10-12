import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProcessInvocation, ProcessResult } from '@/application/ports/ProcessRunnerPort';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asISODateTime, asMessageId, asSessionId } from '@/domain/Ids';
import { NodeWorkspaceFileSystem } from '@/infrastructure/file-system/NodeWorkspaceFileSystem';
import { LocalToolRegistry } from '@/infrastructure/tools/LocalToolExecutor';
import { createFileTool } from '@/infrastructure/tools/providers/CreateFileProvider';
import { runProcessTool } from '@/infrastructure/tools/providers/RunProcessProvider';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { JsonSessionMemoryStore } from '@/infrastructure/persistence/JsonSessionMemoryStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import {
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
} from '@/test-support/AgentEventFixtures';
import { createDeferred } from '@/test-support/createDeferred';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import {
	PROCESS_FIXTURE_NAME,
	PROCESS_FIXTURE_LARGE_BYTES,
	writeProcessFixture,
} from '@/test-support/processFixture';
import { TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { abortError } from './cancellation';
import { ToolRunner, ToolBatchValidationError, type ToolApprovalHandler } from './ToolRunner';
import { SessionService } from './SessionService';
import { ContextBuilder } from './ContextBuilder';
import { estimateMessageTokens } from './ModelRequestEstimator';
import { projectHistoryTurn } from './HistoryTurns';
import { SessionMemoryService } from './SessionMemoryService';

const sessionId = asSessionId('phase19-tools');
const clock = { now: () => asISODateTime('2026-10-11T12:00:00Z') };
const invocation = { program: 'bun', args: ['test'], cwd: '.', timeoutMs: 1000 };
const processCall = (input: unknown = invocation) => ({ name: 'run_process', arguments: input });
const result = (input: ProcessInvocation): ProcessResult => ({
	program: input.program,
	args: [...input.args],
	cwd: input.cwd,
	exitCode: 0,
	signal: null,
	timedOut: false,
	durationMs: 0,
	stdout: 'ok',
	stderr: '',
	stdoutBytes: 2,
	stderrBytes: 0,
	stdoutTruncated: false,
	stderrTruncated: false,
});
const harness = (
	approveToolCall?: ToolApprovalHandler,
	run?: (input: ProcessInvocation) => Promise<ProcessResult>,
) => {
	const launches: ProcessInvocation[] = [];
	const store = new InMemorySessionStore();
	const service = new SessionService(store);
	const registry = new LocalToolRegistry([
		runProcessTool({
			run: async (input) => {
				launches.push(input);
				return run?.(input) ?? result(input);
			},
		}),
		createFileTool(new NodeWorkspaceFileSystem('.'), { maxFileBytes: 200000 }),
	]);
	const runner = new ToolRunner({
		sessionStore: service,
		clock,
		idGenerator: new BunUuidV7IdGenerator(),
		toolExecutor: registry,
		...(approveToolCall === undefined ? {} : { approveToolCall }),
	});
	return { launches, store, service, registry, runner };
};

describe('run_process through existing ToolRunner boundary', () => {
	test('starts only after full preparation and explicit approval of exact frozen values', async () => {
		const approval = createDeferred<boolean>();
		const waiting = createDeferred<void>();
		const raw = { program: 'bun', args: ['test'], cwd: './src', timeoutMs: 1000 };
		const f = harness(async (request) => {
			expect(f.launches).toEqual([]);
			expect(request.toolInput).toEqual({ ...raw, cwd: 'src' });
			expect(Object.isFrozen(request.toolInput)).toBe(true);
			expect(Reflect.set(request.toolInput as object, 'timeoutMs', 300000)).toBe(false);
			waiting.resolve();
			return approval.promise;
		});
		const calls = f.runner.prepareToolCalls([processCall(raw)]);
		expect(f.store.events).toEqual([]);
		expect(f.launches).toEqual([]);
		const pending = f.runner.executeToolCalls(sessionId, calls);
		await waiting.promise;
		raw.program = 'different';
		raw.args[0] = 'changed';
		raw.cwd = '.';
		raw.timeoutMs = 300000;
		expect(f.launches).toEqual([]);
		approval.resolve(true);
		await pending;
		expect(f.launches).toEqual([{ program: 'bun', args: ['test'], cwd: 'src', timeoutMs: 1000 }]);
		expect(f.store.events.map((event) => event.type)).toEqual([
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
		]);
	});
	for (const explicit of [true, false])
		test(`denial starts zero processes and closes siblings (explicit=${explicit})`, async () => {
			const f = harness(explicit ? async () => false : undefined);
			const outcome = await f.runner.executeToolCalls(
				sessionId,
				f.runner.prepareToolCalls([processCall(), processCall()]),
			);
			expect(outcome.terminalMessage).toContain('not approved: run_process');
			expect(f.launches).toEqual([]);
			expect(
				f.store.events
					.filter((event) => event.type === 'tool.call.failed')
					.map((event) => event.error.code),
			).toEqual(['TOOL_APPROVAL_DENIED', 'TOOL_BATCH_CANCELLED']);
			expect(f.store.events.some((event) => event.type === 'tool.call.started')).toBe(false);
		});
	test('invalid file-tool sibling prevents process execution, approval and IDs for the complete batch', async () => {
		let approvals = 0;
		const f = harness(async () => {
			approvals++;
			return true;
		});
		expect(() =>
			f.runner.prepareToolCalls([
				processCall(),
				{ name: 'create_file', arguments: { path: 'uncreated' } },
			]),
		).toThrow(ToolBatchValidationError);
		expect(approvals).toBe(0);
		expect(f.launches).toEqual([]);
		expect(f.store.events).toEqual([]);
	});
	test('valid repeated process calls execute sequentially without deduplication', async () => {
		const first = createDeferred<ProcessResult>();
		const waiting = createDeferred<void>();
		let count = 0;
		const f = harness(
			async () => true,
			async (input) => {
				if (++count === 1) {
					waiting.resolve();
					return first.promise;
				}
				return result(input);
			},
		);
		const pending = f.runner.executeToolCalls(
			sessionId,
			f.runner.prepareToolCalls([processCall(), processCall()]),
		);
		await waiting.promise;
		expect(f.launches).toHaveLength(1);
		first.resolve(result(invocation));
		await pending;
		expect(f.launches).toHaveLength(2);
		expect(f.store.events.filter((event) => event.type === 'tool.call.completed')).toHaveLength(2);
	});
	test('non-zero is completed; runtime/spawn exception is TOOL_FAILED and model-visible', async () => {
		const success = harness(
			async () => true,
			async (input) => ({ ...result(input), exitCode: 7, stderr: 'failing test' }),
		);
		await success.runner.executeToolCalls(
			sessionId,
			success.runner.prepareToolCalls([processCall()]),
		);
		expect(success.store.events.at(-1)).toMatchObject({
			type: 'tool.call.completed',
			output: { exitCode: 7 },
		});
		const failure = harness(
			async () => true,
			async () => {
				throw new Error('Process could not start (ENOENT): missing');
			},
		);
		await failure.runner.executeToolCalls(
			sessionId,
			failure.runner.prepareToolCalls([processCall()]),
		);
		expect(failure.store.events.at(-1)).toMatchObject({
			type: 'tool.call.failed',
			error: { code: 'TOOL_FAILED', message: 'Process could not start (ENOENT): missing' },
		});
		const state = await failure.service.readSessionState(sessionId);
		expect(JSON.parse(state.messages.at(-1)!.content)).toEqual({
			error: { message: 'Process could not start (ENOENT): missing' },
		});
		expect(JSON.stringify(failure.store.events)).not.toContain('exitCode');
	});
	test('cancellation before late approval starts zero processes', async () => {
		const decision = createDeferred<boolean>();
		const waiting = createDeferred<void>();
		const controller = new AbortController();
		const f = harness(async () => {
			waiting.resolve();
			return decision.promise;
		});
		const pending = f.runner.executeToolCalls(
			sessionId,
			f.runner.prepareToolCalls([processCall()]),
			{ signal: controller.signal },
		);
		const rejected = pending.catch((error: unknown) => error);
		await waiting.promise;
		controller.abort();
		decision.resolve(true);
		expect(await rejected).toHaveProperty('name', 'AbortError');
		expect(f.launches).toEqual([]);
		expect(f.store.events.some((event) => event.type === 'tool.call.started')).toBe(false);
	});
	test('executing process AbortError cannot publish completed or failed results or retry', async () => {
		const controller = new AbortController();
		const store = new InMemorySessionStore();
		let launches = 0;
		let receivedSignal: AbortSignal | undefined;
		const registry = new LocalToolRegistry([
			runProcessTool({
				run: async (_input, { signal }) => {
					launches++;
					receivedSignal = signal;
					controller.abort();
					throw abortError();
				},
			}),
		]);
		const runner = new ToolRunner({
			sessionStore: new SessionService(store),
			clock,
			idGenerator: new BunUuidV7IdGenerator(),
			toolExecutor: registry,
			approveToolCall: async () => true,
		});
		await expect(
			runner.executeToolCalls(sessionId, runner.prepareToolCalls([processCall()]), {
				signal: controller.signal,
			}),
		).rejects.toHaveProperty('name', 'AbortError');
		expect(receivedSignal).toBe(controller.signal);
		expect(launches).toBe(1);
		expect(store.events.map((event) => event.type)).toEqual([
			'tool.call.requested',
			'tool.call.started',
		]);
	});
});

test('bounded real process events persist/replay normally; stdout/stderr are excluded from retrieval and memory', async () => {
	const temp = await createTempDirectory('phase19-replay-');
	await writeProcessFixture(temp.directory);
	const store = new JsonlSessionStore(join(temp.directory, 'sessions'));
	const service = new SessionService(store);
	const registry = createLocalToolExecutor({ workspaceRoot: temp.directory });
	const runner = new ToolRunner({
		sessionStore: service,
		clock,
		idGenerator: new BunUuidV7IdGenerator(),
		toolExecutor: registry,
		approveToolCall: async () => true,
	});
	const memory = new SessionMemoryService(
		service,
		new JsonSessionMemoryStore(join(temp.directory, 'memory')),
	);
	try {
		await memory.activate(sessionId, []);
		await service.appendSessionEvent(
			promptSubmittedEvent({ sessionId, prompt: 'Check the disposable helper.' }),
		);
		const calls = runner.prepareToolCalls([
			processCall({ program: 'bun', args: [PROCESS_FIXTURE_NAME, 'large'] }),
		]);
		await service.appendSessionEvent(
			assistantToolCallsCompletedEvent({
				sessionId,
				toolCalls: calls.map((record) => record.call),
			}),
		);
		await runner.executeToolCalls(sessionId, calls);
		const events = await store.readSessionEvents(sessionId);
		const completion = events.find((event) => event.type === 'tool.call.completed');
		expect(completion).toMatchObject({
			output: {
				exitCode: 0,
				stdoutBytes: PROCESS_FIXTURE_LARGE_BYTES,
				stderrBytes: PROCESS_FIXTURE_LARGE_BYTES,
				stdoutTruncated: true,
				stderrTruncated: true,
			},
		});
		const raw = await readFile(join(temp.directory, 'sessions', sessionId, 'events.jsonl'), 'utf8');
		expect(Buffer.byteLength(raw)).toBeLessThan(23000);
		expect(raw).not.toContain(temp.directory);
		const state = await service.readSessionState(sessionId);
		const replayed = await new SessionService(
			new JsonlSessionStore(join(temp.directory, 'sessions')),
		).readSessionState(sessionId);
		expect(replayed).toEqual(state);
		expect(JSON.parse(state.messages.at(-1)!.content)).toEqual(
			completion?.type === 'tool.call.completed' ? completion.output : undefined,
		);
		const projection = projectHistoryTurn(state.messages);
		expect(projection).toContain('tool: run_process');
		expect(projection).not.toContain('HEAD');
		expect(projection).not.toContain('TAIL');
		expect(projection).not.toContain('stdout');
		expect(memory.snapshot(sessionId)?.files).toEqual([]);
		expect(JSON.stringify(memory.snapshot(sessionId))).not.toContain('HEAD');
		const compiler = new ContextBuilder({
			systemPrompt: 'Use workspace tools.',
			contextProfile: TEST_CONTEXT_PROFILE,
		});
		const compiled = compiler.build(state, registry.listTools());
		expect(compiled.messages.slice(1, -1)).toEqual(state.messages.slice(0, -1));
		const observation = JSON.parse(compiled.messages.at(-1)!.content);
		expect(observation.contextProjection).toMatchObject({
			stdoutTruncated: true,
			stderrTruncated: true,
		});
		expect(observation).toMatchObject({
			stdoutBytes: PROCESS_FIXTURE_LARGE_BYTES,
			stderrBytes: PROCESS_FIXTURE_LARGE_BYTES,
			stdoutTruncated: true,
			stderrTruncated: true,
		});
		expect(compiler.build(replayed, registry.listTools())).toEqual(compiled);
	} finally {
		memory.dispose();
		await temp.cleanup();
	}
});

test('the Phase 19 overflow observation fits its model projection without changing canonical output or context limits', () => {
	const f = harness();
	const output = result(invocation);
	output.stdout = '\ufffd'.repeat(2700);
	output.stderr = output.stdout;
	const state = {
		sessionId,
		messages: [
			{ role: 'user' as const, id: asMessageId('active'), content: 'Check.' },
			{
				role: 'tool' as const,
				toolName: 'run_process',
				toolCallId: new BunUuidV7IdGenerator().nextToolCallId(),
				content: JSON.stringify(output),
			},
		],
	};
	expect(Buffer.byteLength(output.stdout)).toBeLessThanOrEqual(8192);
	const compiler = new ContextBuilder({
		systemPrompt: 'Use workspace tools.',
		contextProfile: TEST_CONTEXT_PROFILE,
	});
	// Preserve the original overflow evidence, now resolved only at request projection.
	expect(estimateMessageTokens(state.messages[1]!)).toBeGreaterThan(11264);
	const compiled = compiler.build(state, f.registry.listTools());
	expect(compiled.diagnostics.estimatedInputTokens).toBeLessThanOrEqual(11264);
	expect(compiled.contextProfile).toEqual(TEST_CONTEXT_PROFILE);
	expect(JSON.parse(compiled.messages.at(-1)!.content)).toMatchObject({
		exitCode: 0,
		contextProjection: { stdoutTruncated: true, stderrTruncated: true },
	});
	expect(state.messages[1]!.content).toBe(JSON.stringify(output));
});
