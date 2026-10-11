import { strict as assert } from 'node:assert';
import { readdir } from 'node:fs/promises';
import type { ProcessResult } from '../src/application/ports/ProcessRunnerPort';
import { SessionService } from '../src/application/services/SessionService';
import { ToolRunner } from '../src/application/services/ToolRunner';
import { createLocalToolExecutor } from '../src/composition/factories/createLocalToolExecutor';
import { asISODateTime, asSessionId } from '../src/domain/Ids';
import { BunUuidV7IdGenerator } from '../src/infrastructure/runtime/BunUuidV7IdGenerator';
import { PROCESS_OUTPUT_BYTES } from '../src/infrastructure/process/BoundedProcessOutput';
import { InMemorySessionStore } from '../src/test-support/InMemorySessionStore';
import { createTempDirectory } from '../src/test-support/createTempDirectory';
import {
	PROCESS_FIXTURE_NAME,
	PROCESS_FIXTURE_LARGE_BYTES,
	writeProcessFixture,
} from '../src/test-support/processFixture';

// No model: explicitly approved harmless local smoke through the production registry/adapter.
const temp = await createTempDirectory('phase19-local-smoke-');
const store = new InMemorySessionStore();
const sessionId = asSessionId('phase19-smoke');
let approvals = 0;
const runner = new ToolRunner({
	sessionStore: new SessionService(store),
	toolExecutor: createLocalToolExecutor({ workspaceRoot: temp.directory }),
	idGenerator: new BunUuidV7IdGenerator(),
	clock: { now: () => asISODateTime('2026-10-11T12:00:00Z') },
	approveToolCall: async (request) => {
		assert.equal(request.toolName, 'run_process');
		assert(Object.isFrozen(request.toolInput));
		approvals++;
		return true;
	},
});
const run = async (mode: string, args: string[] = [], timeoutMs = 2000, signal?: AbortSignal) => {
	const calls = runner.prepareToolCalls([
		{
			name: 'run_process',
			arguments: { program: 'bun', args: [PROCESS_FIXTURE_NAME, mode, ...args], timeoutMs },
		},
	]);
	await runner.executeToolCalls(sessionId, calls, signal === undefined ? {} : { signal });
	const last = store.events.at(-1);
	assert.equal(last?.type, 'tool.call.completed');
	return (last as Extract<typeof last, { type: 'tool.call.completed' }>).output as ProcessResult;
};
const report = (mode: string, result: ProcessResult) =>
	console.log(
		JSON.stringify({
			mode,
			exitCode: result.exitCode,
			signal: result.signal,
			timedOut: result.timedOut,
			stdoutBytes: result.stdoutBytes,
			stderrBytes: result.stderrBytes,
			stdoutRetainedBytes: Buffer.byteLength(result.stdout),
			stderrRetainedBytes: Buffer.byteLength(result.stderr),
			stdoutTruncated: result.stdoutTruncated,
			stderrTruncated: result.stderrTruncated,
		}),
	);

try {
	await writeProcessFixture(temp.directory);
	const success = await run('success');
	assert.equal(success.exitCode, 0);
	assert.equal(success.stdout, 'stdout ok\n');
	report('success', success);
	const failure = await run('failure');
	assert.equal(failure.exitCode, 7);
	assert.equal(failure.stderr, 'stderr failure\n');
	report('failure', failure);
	const literal = [
		'hello && touch side-effect',
		'hello; touch side-effect',
		'hello | touch side-effect',
		'hello > side-effect',
	];
	const argv = await run('argv', literal);
	assert.deepEqual(JSON.parse(argv.stdout), literal);
	assert.deepEqual(await readdir(temp.directory), [PROCESS_FIXTURE_NAME]);
	report('argv', argv);
	const large = await run('large');
	for (const stream of ['stdout', 'stderr'] as const) {
		assert.equal(
			large[(stream + 'Bytes') as 'stdoutBytes' | 'stderrBytes'],
			PROCESS_FIXTURE_LARGE_BYTES,
		);
		assert.equal(Buffer.byteLength(large[stream]), PROCESS_OUTPUT_BYTES);
		assert(large[stream].startsWith('HEAD'));
		assert(large[stream].endsWith('TAIL'));
	}
	assert.equal(large.exitCode, 0);
	report('large', large);
	const timeout = await run('wait', [], 1000);
	assert.equal(timeout.timedOut, true);
	assert(timeout.durationMs < 4000);
	report('timeout', timeout);
	const controller = new AbortController();
	const abort = setTimeout(() => controller.abort(), 100);
	try {
		await assert.rejects(run('wait', [], 2000, controller.signal), { name: 'AbortError' });
	} finally {
		clearTimeout(abort);
	}
	assert.equal(store.events.at(-1)?.type, 'tool.call.started');
	assert.equal(approvals, 6);
	console.log(
		JSON.stringify({ mode: 'cancellation', result: 'AbortError', normalResultPublished: false }),
	);
	console.log(
		JSON.stringify({
			result: 'PASS',
			approvedInvocations: approvals,
			modelInferenceRequests: 0,
			platform: process.platform,
		}),
	);
} finally {
	await temp.cleanup();
}
