import { describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProcessInvocation, ProcessResult } from '@/application/ports/ProcessRunnerPort';
import type { ModelStreamChunk } from '@/application/ports/ModelPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { SessionService } from '@/application/services/SessionService';
import type { ToolApprovalRequest } from '@/application/services/ToolRunner';
import { readConfig } from '@/composition/config';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asISODateTime, asSessionId } from '@/domain/Ids';
import { LocalToolRegistry } from '@/infrastructure/tools/LocalToolExecutor';
import { runProcessTool } from '@/infrastructure/tools/providers/RunProcessProvider';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { RecordingToolExecutor } from '@/test-support/RecordingToolExecutor';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { RunAgentTurn } from './RunAgentTurn';

const sessionId = asSessionId('verification-fixture');
const source = (value: number) => `export const value = ${value};\n`;
const processInput = { program: 'project-check', args: ['focused', 'source.js'] };
const edit = (from: number, to: number): ModelStreamChunk => ({
	contentDelta: '',
	toolCalls: [
		{
			name: 'edit_file',
			arguments: { path: 'source.js', edits: [{ oldText: source(from), newText: source(to) }] },
		},
	],
});
const verify: ModelStreamChunk = {
	contentDelta: '',
	toolCalls: [{ name: 'run_process', arguments: processInput }],
};
const final = (contentDelta: string): ModelStreamChunk => ({ contentDelta });
const result = (overrides: Partial<ProcessResult> = {}): ProcessResult => ({
	...processInput,
	cwd: '.',
	exitCode: 0,
	signal: null,
	timedOut: false,
	durationMs: 8,
	stdout: 'source.js focused check passed\n',
	stderr: '',
	stdoutBytes: 31,
	stderrBytes: 0,
	stdoutTruncated: false,
	stderrTruncated: false,
	...overrides,
});
const relevantFailure = result({
	exitCode: 1,
	stdout: '',
	stderr: 'source.js:1 expected value 3, received 2',
	stdoutBytes: 0,
	stderrBytes: 37,
});
const prompt = `Set source.js value to 3. Current content is ${JSON.stringify(source(1))}. The documented focused verification is program project-check with args ["focused", "source.js"].`;

// Scripted decisions are behavioral fixtures; they assert runtime/evidence boundaries,
// not that an arbitrary real model will always obey the instruction.
const fixture = async (
	steps: ModelStreamChunk[],
	outcomes: Array<ProcessResult | Error> = [],
	denyProcess = false,
) => {
	const temp = await createTempDirectory('phase191-behavior-');
	const path = join(temp.directory, 'source.js');
	await writeFile(path, source(1));
	const store = new InMemorySessionStore();
	const sessions = new SessionService(store);
	const model = new ScriptedModel(steps.map((step) => [step]));
	const launches: Array<{ input: ProcessInvocation; source: string }> = [];
	const approvals: ToolApprovalRequest[] = [];
	const production = createLocalToolExecutor({ workspaceRoot: temp.directory });
	const processRegistry = new LocalToolRegistry([
		runProcessTool({
			run: async (input) => {
				launches.push({ input, source: await readFile(path, 'utf8') });
				const outcome = outcomes[launches.length - 1];
				if (outcome instanceof Error) throw outcome;
				if (!outcome) throw new Error('Unexpected process execution.');
				return structuredClone(outcome);
			},
		}),
	]);
	const executor = new RecordingToolExecutor(
		production.listTools(),
		() => {
			throw new Error('Unprepared execution.');
		},
		(request) =>
			(request.toolName === 'run_process' ? processRegistry : production).prepare(request),
	);
	const loop = new RunAgentTurn({
		model,
		sessionStore: sessions,
		toolExecutor: executor,
		contextBuilder: new ContextBuilder({
			systemPrompt: readConfig({}).SYSTEM_PROMPT,
			contextProfile: TEST_CONTEXT_PROFILE,
		}),
		clock: { now: () => asISODateTime('2026-10-12T12:00:00Z') },
		idGenerator: new BunUuidV7IdGenerator(),
		approveToolCall: async (request) => {
			if (request.toolName === 'run_process')
				expect(launches.length).toBe(approvals.filter((a) => a.toolName === 'run_process').length);
			expect(store.events.at(-1)?.type).toBe('tool.call.requested');
			approvals.push(request);
			return !(denyProcess && request.toolName === 'run_process');
		},
	});
	return {
		...temp,
		path,
		store,
		sessions,
		model,
		launches,
		approvals,
		executor,
		run: (text = prompt) => collectAsyncIterable(loop.run({ sessionId, prompt: text })),
	};
};
const requested = (f: Awaited<ReturnType<typeof fixture>>) =>
	f.store.events
		.filter((event) => event.type === 'tool.call.requested')
		.map((event) => event.toolName);
const toolResults = (f: Awaited<ReturnType<typeof fixture>>, round: number) =>
	f.model.receivedInputs[round]!.messages.filter((message) => message.role === 'tool').map(
		(message) => JSON.parse(message.content),
	);

describe('model-driven verification through the unchanged generic loop', () => {
	test('change → explicit verification → truthful scoped final uses normal approval and result context', async () => {
		const f = await fixture(
			[edit(1, 3), verify, final('Changed source.js. The focused source.js check passed.')],
			[result()],
		);
		try {
			await f.run();
			expect(requested(f)).toEqual(['edit_file', 'run_process']);
			expect(f.approvals.map((a) => a.toolName)).toEqual(['edit_file', 'run_process']);
			expect(f.approvals[1]!.toolInput).toEqual({ ...processInput, cwd: '.', timeoutMs: 60000 });
			expect(f.launches).toEqual([
				{ input: { ...processInput, cwd: '.', timeoutMs: 60000 }, source: source(3) },
			]);
			expect(toolResults(f, 1)).toEqual([{ path: 'source.js', changed: true, editsApplied: 1 }]);
			expect(toolResults(f, 2).at(-1)).toEqual(result());
			expect(f.store.events.map((e) => e.type)).toEqual([
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
			expect(f.store.events.at(-1)).toMatchObject({
				content: 'Changed source.js. The focused source.js check passed.',
			});
		} finally {
			await f.cleanup();
		}
	});
	test('relevant diagnostic → bounded repair → deliberate reverify preserves exact ordering without runtime retry', async () => {
		const f = await fixture(
			[
				edit(1, 2),
				verify,
				edit(2, 3),
				verify,
				final('Corrected source.js. The focused check passed after the repair.'),
			],
			[relevantFailure, result()],
		);
		try {
			await f.run();
			expect(requested(f)).toEqual(['edit_file', 'run_process', 'edit_file', 'run_process']);
			expect(f.executor.receivedRequests.map((r) => r.toolName)).toEqual(requested(f));
			expect(f.approvals.map((a) => a.toolName)).toEqual(requested(f));
			expect(f.launches.map((r) => r.source)).toEqual([source(2), source(3)]);
			expect(f.model.receivedInputs).toHaveLength(5);
			expect(toolResults(f, 2).at(-1)).toEqual(relevantFailure);
			expect(toolResults(f, 4).at(-1)).toEqual(result());
			expect(
				f.store.events.filter((e) => e.type === 'tool.call.completed').map((e) => e.toolName),
			).toEqual(requested(f));
			expect(f.store.events.some((e) => e.type === 'tool.call.failed')).toBe(false);
		} finally {
			await f.cleanup();
		}
	});
	test('unrelated failure is reported without speculative edits to untouched files', async () => {
		const unrelated = result({
			exitCode: 1,
			stderr: 'untouched/integration.js: external database is unavailable',
			stderrBytes: 55,
		});
		const f = await fixture(
			[
				edit(1, 3),
				verify,
				final(
					'Changed source.js. Verification failed because an unrelated integration database is unavailable; source.js is not verified.',
				),
			],
			[unrelated],
		);
		try {
			await f.run();
			expect(requested(f)).toEqual(['edit_file', 'run_process']);
			expect(toolResults(f, 2).at(-1)).toEqual(unrelated);
			expect(await readFile(f.path, 'utf8')).toBe(source(3));
			expect(f.store.events.at(-1)).toMatchObject({
				content:
					'Changed source.js. Verification failed because an unrelated integration database is unavailable; source.js is not verified.',
			});
		} finally {
			await f.cleanup();
		}
	});
	test('denial ends the turn truthfully with zero process execution and no retry or alternative round', async () => {
		const f = await fixture(
			[edit(1, 3), verify, final('This must never be reached.')],
			[result()],
			true,
		);
		try {
			await f.run();
			expect(f.launches).toEqual([]);
			expect(f.model.receivedInputs).toHaveLength(2);
			expect(f.executor.receivedRequests.map((r) => r.toolName)).toEqual(['edit_file']);
			expect(f.store.events.at(-1)).toMatchObject({
				type: 'assistant.message.completed',
				content: 'Tool call was not approved: run_process',
			});
			expect(f.store.events.filter((e) => e.type === 'tool.call.failed')).toMatchObject([
				{ error: { code: 'TOOL_APPROVAL_DENIED' } },
			]);
		} finally {
			await f.cleanup();
		}
	});
	test('unavailable executable yields recoverable tool feedback without fake exit code or package installation', async () => {
		const f = await fixture(
			[
				edit(1, 3),
				verify,
				final(
					'Changed source.js. Verification is blocked: project-check could not start; the change remains unverified.',
				),
			],
			[new Error('Process could not start (ENOENT): project-check')],
		);
		try {
			await f.run();
			expect(f.launches).toHaveLength(1);
			expect(toolResults(f, 2).at(-1)).toEqual({
				error: { message: 'Process could not start (ENOENT): project-check' },
			});
			expect(requested(f)).toEqual(['edit_file', 'run_process']);
			expect(f.store.events.filter((e) => e.type === 'tool.call.completed')).toHaveLength(1);
			expect(f.store.events.filter((e) => e.type === 'tool.call.failed')).toMatchObject([
				{ error: { code: 'TOOL_FAILED' } },
			]);
		} finally {
			await f.cleanup();
		}
	});
	test('timeout is visible and finalizes inconclusively without automatic retry', async () => {
		const timeout = result({
			exitCode: null,
			signal: 'SIGTERM',
			timedOut: true,
			durationMs: 60001,
			stdout: 'started',
			stdoutBytes: 7,
		});
		const f = await fixture(
			[edit(1, 3), verify, final('The check timed out; verification is inconclusive.')],
			[timeout],
		);
		try {
			await f.run();
			expect(toolResults(f, 2).at(-1)).toEqual(timeout);
			expect(f.launches).toHaveLength(1);
			expect(f.model.receivedInputs).toHaveLength(3);
			expect(f.store.events.some((e) => e.type === 'tool.call.failed')).toBe(false);
		} finally {
			await f.cleanup();
		}
	});
	test('after timeout a model may deliberately request an evidence-known narrower check with fresh approval', async () => {
		const narrow = {
			...verify,
			toolCalls: [
				{ name: 'run_process', arguments: { ...processInput, args: ['single-case', 'source.js'] } },
			],
		};
		const f = await fixture(
			[
				edit(1, 3),
				verify,
				narrow,
				final('The narrow check passed; the broader check timed out, so verification is partial.'),
			],
			[
				result({ timedOut: true, exitCode: null, signal: 'SIGTERM' }),
				result({ args: ['single-case', 'source.js'] }),
			],
		);
		try {
			await f.run(`${prompt} A documented narrower check uses args ["single-case", "source.js"].`);
			expect(f.launches.map((l) => l.input.args)).toEqual([
				processInput.args,
				['single-case', 'source.js'],
			]);
			expect(f.approvals.filter((a) => a.toolName === 'run_process')).toHaveLength(2);
			expect(f.model.receivedInputs).toHaveLength(4);
		} finally {
			await f.cleanup();
		}
	});
	test('repair without a second process run remains legal and explicitly unverified', async () => {
		const f = await fixture(
			[
				edit(1, 2),
				verify,
				edit(2, 3),
				final('Corrected the reported source.js value. The repaired state was not reverified.'),
			],
			[relevantFailure],
		);
		try {
			await f.run();
			expect(requested(f)).toEqual(['edit_file', 'run_process', 'edit_file']);
			expect(f.launches).toHaveLength(1);
			expect(await readFile(f.path, 'utf8')).toBe(source(3));
			expect(f.store.events.at(-1)).toMatchObject({
				content: 'Corrected the reported source.js value. The repaired state was not reverified.',
			});
		} finally {
			await f.cleanup();
		}
	});
	test('known verification command executes directly without runtime-required discovery', async () => {
		const f = await fixture([edit(1, 3), verify, final('Focused check passed.')], [result()]);
		try {
			await f.run();
			expect(f.executor.preparationRequests.map((r) => r.toolName)).toEqual([
				'edit_file',
				'run_process',
			]);
			expect(f.model.receivedInputs.every((input) => input.tools?.length === 10)).toBe(true);
		} finally {
			await f.cleanup();
		}
	});
	test('a mutation may finish without process execution, including an explicit user prohibition', async () => {
		const f = await fixture([
			edit(1, 3),
			final('Changed source.js only. Verification was not run, as requested.'),
		]);
		try {
			await f.run(`${prompt} Only edit the file; do not run commands or tests.`);
			expect(requested(f)).toEqual(['edit_file']);
			expect(f.launches).toEqual([]);
			expect(f.approvals).toHaveLength(1);
			expect(f.model.receivedInputs).toHaveLength(2);
		} finally {
			await f.cleanup();
		}
	});
	test('a model may intentionally finish a material mutation unverified without a runtime-injected process', async () => {
		const f = await fixture([edit(1, 3), final('Changed source.js. Verification was not run.')]);
		try {
			await f.run();
			expect(requested(f)).toEqual(['edit_file']);
			expect(f.launches).toEqual([]);
			expect(f.model.receivedInputs).toHaveLength(2);
		} finally {
			await f.cleanup();
		}
	});
	test('a maximum retained process observation reaches the next model round, while canonical output stays exact', async () => {
		const large = result({
			exitCode: 1,
			stdout: '\ufffd'.repeat(2730),
			stderr: `source.js:1 error\n${'\ufffd'.repeat(2700)}`,
			stdoutBytes: 50000,
			stderrBytes: 60000,
			stdoutTruncated: true,
			stderrTruncated: true,
		});
		const f = await fixture(
			[edit(1, 2), verify, edit(2, 3), verify, final('Focused verification passed after repair.')],
			[large, result()],
		);
		try {
			await f.run();
			expect(toolResults(f, 2).at(-1)).toMatchObject({
				exitCode: 1,
				stdoutBytes: 50000,
				stderrBytes: 60000,
				stdoutTruncated: true,
				stderrTruncated: true,
				contextProjection: { stdoutTruncated: true, stderrTruncated: true },
			});
			expect(toolResults(f, 2).at(-1)!.stderr).toStartWith('source.js:1 error');
			expect(
				f.store.events.find(
					(e) => e.type === 'tool.call.completed' && e.toolName === 'run_process',
				),
			).toMatchObject({ output: large });
			expect(f.model.receivedInputs).toHaveLength(5);
			expect(f.launches).toHaveLength(2);
		} finally {
			await f.cleanup();
		}
	});
	test('the existing twelve-round generic limit bounds repeated repair batches', async () => {
		const steps = Array.from({ length: 12 }, (_, index) =>
			index % 2 === 0 ? edit(index / 2 + 1, index / 2 + 2) : verify,
		);
		const failures = Array.from({ length: 6 }, () =>
			result({ exitCode: 1, stderr: 'source.js:1 still failing', stderrBytes: 24 }),
		);
		const f = await fixture(steps, failures);
		try {
			await expect(f.run()).rejects.toThrow('Tool iteration limit reached.');
			expect(f.model.receivedInputs).toHaveLength(12);
			expect(f.launches).toHaveLength(6);
			expect(f.approvals).toHaveLength(12);
			expect(requested(f)).toEqual(
				Array.from({ length: 6 }, () => ['edit_file', 'run_process']).flat(),
			);
			expect(f.store.events.at(-1)).toMatchObject({
				type: 'agent.error',
				error: { code: 'TOOL_ITERATION_LIMIT_REACHED' },
			});
			expect(f.store.events.some((e) => e.type === 'assistant.message.completed')).toBe(false);
		} finally {
			await f.cleanup();
		}
	});
});
