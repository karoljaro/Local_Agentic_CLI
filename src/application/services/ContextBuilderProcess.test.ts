import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProcessResult } from '@/application/ports/ProcessRunnerPort';
import { readConfig } from '@/composition/config';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';
import type { AgentState } from '@/domain/AgentState';
import type { ModelMessage } from '@/domain/ModelMessage';
import { BoundedProcessOutput } from '@/infrastructure/process/BoundedProcessOutput';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import {
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
} from '@/test-support/AgentEventFixtures';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { FakeMemoryStore, FakeMemoryUpdater } from '@/test-support/SessionMemoryFixtures';
import { TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { ContextBuilder, ContextBudgetExceededError } from './ContextBuilder';
import { estimateMessageTokens } from './ModelRequestEstimator';
import { projectHistoryTurn } from './HistoryTurns';
import { SessionService } from './SessionService';
import { SessionMemoryService } from './SessionMemoryService';

const sessionId = asSessionId('process-context');
const toolCallId = asToolCallId('process-call');
const tools = createLocalToolExecutor().listTools();
const compiler = () =>
	new ContextBuilder({
		systemPrompt: readConfig({}).SYSTEM_PROMPT,
		contextProfile: TEST_CONTEXT_PROFILE,
	});
const result = (overrides: Partial<ProcessResult> = {}): ProcessResult => ({
	program: 'project-check',
	args: ['source.js'],
	cwd: '.',
	exitCode: 1,
	signal: null,
	timedOut: false,
	durationMs: 42,
	stdout: 'ok',
	stderr: 'source.js:1 error',
	stdoutBytes: 2,
	stderrBytes: 17,
	stdoutTruncated: false,
	stderrTruncated: false,
	...overrides,
});
const toolMessage = (output: unknown, toolName = 'run_process'): ModelMessage => ({
	role: 'tool',
	toolName,
	toolCallId,
	content: JSON.stringify(output),
});
const stateFor = (output: unknown): AgentState => ({
	sessionId,
	messages: [
		{
			role: 'user',
			id: asMessageId('user'),
			content: 'Change source.js. Known verification: project-check source.js.',
		},
		{
			role: 'assistant',
			content: '',
			toolCalls: [{ name: 'read_file', arguments: { path: 'source.js' } }],
		},
		{
			role: 'tool',
			toolName: 'read_file',
			toolCallId: asToolCallId('read'),
			content: JSON.stringify({
				path: 'source.js',
				content: 's'.repeat(2048),
				version: 'a'.repeat(64),
			}),
		},
		{
			role: 'assistant',
			content: '',
			toolCalls: [
				{
					name: 'edit_file',
					arguments: { path: 'source.js', edits: [{ oldText: 'old', newText: 'new' }] },
				},
			],
		},
		{
			role: 'tool',
			toolName: 'edit_file',
			toolCallId: asToolCallId('edit'),
			content: '{"path":"source.js","changed":true}',
		},
		{
			role: 'assistant',
			content: '',
			toolCalls: [
				{
					id: toolCallId,
					name: 'run_process',
					arguments: { program: 'project-check', args: ['source.js'], cwd: '.', timeoutMs: 60000 },
				},
			],
		},
		toolMessage(output),
	],
});
const observation = (state: AgentState) => {
	const context = compiler().build(state, tools);
	return { context, output: JSON.parse(context.messages.at(-1)!.content) };
};

describe('canonical-preserving process observation projection', () => {
	test('small output stays byte-identical without redundant context flags, including original retention flags', () => {
		for (const truncated of [false, true]) {
			const state = stateFor(result({ stdoutTruncated: truncated }));
			expect(compiler().build(state, tools).messages.slice(1)).toEqual(state.messages);
			expect(observation(state).output.contextProjection).toBeUndefined();
		}
	});
	const invalid = new BoundedProcessOutput();
	invalid.observe(new Uint8Array(8192).fill(0xff));
	const streams = [
		['ASCII', 'x'.repeat(8192)],
		['non-ASCII', 'ą'.repeat(4096)],
		['surrogate pairs', '🙂'.repeat(2048)],
		['invalid UTF-8 replacement', invalid.snapshot().text],
		['nested JSON control escaping', '\u0001'.repeat(8192)],
	] as const;
	for (const [name, text] of streams)
		for (const mode of ['stdout', 'stderr', 'both'] as const) {
			test(`maximum ${name} ${mode} fits with ordinary inspection/edit/call structure and unchanged default limits`, () => {
				expect(Buffer.byteLength(text)).toBeLessThanOrEqual(8192);
				const original = result({
					stdout: mode === 'stderr' ? 'small-out' : text,
					stderr: mode === 'stdout' ? 'small-err' : text,
					stdoutBytes: 90000,
					stderrBytes: 80000,
					stdoutTruncated: true,
					stderrTruncated: false,
				});
				const state = stateFor(original);
				const before = structuredClone(state);
				const { context, output } = observation(state);
				expect(context.contextProfile).toEqual(TEST_CONTEXT_PROFILE);
				expect(context.diagnostics.estimatedInputLimitTokens).toBe(11264);
				expect(context.diagnostics.estimatedInputTokens).toBeLessThanOrEqual(11264);
				expect(context.tools).toHaveLength(10);
				expect(Buffer.byteLength(output.stdout)).toBeLessThanOrEqual(1024);
				expect(Buffer.byteLength(output.stderr)).toBeLessThanOrEqual(1024);
				expect(output).toMatchObject({
					program: original.program,
					args: original.args,
					cwd: original.cwd,
					exitCode: 1,
					signal: null,
					timedOut: false,
					durationMs: 42,
					stdoutBytes: 90000,
					stderrBytes: 80000,
					stdoutTruncated: true,
					stderrTruncated: false,
				});
				expect(output.contextProjection).toMatchObject({
					stdoutTruncated: mode !== 'stderr',
					stderrTruncated: mode !== 'stdout',
				});
				expect(state).toEqual(before);
				expect(compiler().build(state, tools)).toEqual(context);
				const measured = context.messages.reduce(
					(sum, message) => sum + estimateMessageTokens(message),
					0,
				);
				expect(measured).toBeLessThanOrEqual(context.diagnostics.estimatedInputTokens);
			});
		}
	test('head and tail diagnostics remain separate and deterministic with distinct projection/retention truncation', () => {
		const original = result({
			stdout: `HEAD-OUT\n${'middle'.repeat(1300)}\nTAIL-OUT`,
			stderr: `HEAD-ERR\n${'noise'.repeat(1400)}\nTAIL-ERR`,
		});
		const { output } = observation(stateFor(original));
		expect(output.stdout).toStartWith('HEAD-OUT\n');
		expect(output.stdout).toEndWith('\nTAIL-OUT');
		expect(output.stderr).toStartWith('HEAD-ERR\n');
		expect(output.stderr).toEndWith('\nTAIL-ERR');
		expect(output.stdout).toContain('[... context projection truncated ...]');
		expect(output.stdoutTruncated).toBe(false);
		expect(output.stderrTruncated).toBe(false);
		expect(output.contextProjection.stdoutTruncated).toBe(true);
		expect(output.contextProjection.stderrTruncated).toBe(true);
	});
	test('valid non-ASCII boundaries retain complete characters rather than introduce replacement', () => {
		const { output } = observation(stateFor(result({ stdout: `HEAD${'🙂ą'.repeat(1300)}TAIL` })));
		expect(output.stdout).toStartWith('HEAD');
		expect(output.stdout).toEndWith('TAIL');
		expect(output.stdout).not.toContain('\ufffd');
		expect(Buffer.byteLength(output.stdout)).toBeLessThanOrEqual(1024);
	});
	test('maximum duplicate result identity text is bounded without hiding status or altering the approved call', () => {
		const original = result({
			program: '\u0001'.repeat(1024),
			cwd: '\u0001'.repeat(4096),
			args: Array.from({ length: 4 }, () => '\u0001'.repeat(8192)),
			stdout: '\u0001'.repeat(8192),
			stderr: '\u0001'.repeat(8192),
			exitCode: null,
			signal: 'SIGTERM',
			timedOut: true,
		});
		const state = stateFor(original);
		const { context, output } = observation(state);
		expect(Buffer.byteLength(output.program)).toBeLessThanOrEqual(256);
		expect(Buffer.byteLength(output.cwd)).toBeLessThanOrEqual(256);
		expect(output.args.count).toBe(4);
		expect(Buffer.byteLength(output.args.preview)).toBeLessThanOrEqual(512);
		expect(output.contextProjection).toEqual({
			programTruncated: true,
			argsTruncated: true,
			cwdTruncated: true,
			stdoutTruncated: true,
			stderrTruncated: true,
		});
		expect(output).toMatchObject({
			exitCode: null,
			signal: 'SIGTERM',
			timedOut: true,
			durationMs: 42,
		});
		expect(context.messages.at(-2)).toEqual(state.messages.at(-2));
		expect(context.diagnostics.estimatedInputTokens).toBeLessThanOrEqual(11264);
	});
	test('errors, malformed legacy results and unrelated file observations are not reinterpreted', () => {
		for (const value of [
			{ error: { message: 'Process could not start (ENOENT): missing' } },
			null,
			[],
			{ stdout: 'x'.repeat(8192), exitCode: 1 },
		]) {
			const state = stateFor(value);
			expect(compiler().build(state, tools).messages.at(-1)).toEqual(state.messages.at(-1));
		}
		const message = toolMessage(result({ stdout: 'x'.repeat(8192) }), 'read_file');
		const state = stateFor(result());
		state.messages[state.messages.length - 1] = message;
		expect(compiler().build(state, tools).messages.at(-1)).toEqual(message);
	});
	test('unrelated mandatory user/output and oversized exact call overflow still fail, without weakening Phase 16', () => {
		const state = stateFor(result());
		state.messages[0]!.content = 'x'.repeat(100000);
		expect(() => compiler().build(state, tools)).toThrow(ContextBudgetExceededError);
		const hugeCall = stateFor(result());
		const call = hugeCall.messages.at(-2)!;
		if (call.role !== 'assistant') throw new Error('Fixture role.');
		call.toolCalls![0]!.arguments = { program: 'project-check', args: ['ą'.repeat(16000)] };
		expect(() => compiler().build(hugeCall, tools)).toThrow(ContextBudgetExceededError);
	});
	test('JSONL replay recomputes the same projection; retrieval and semantic memory never receive either process body', async () => {
		const temp = await createTempDirectory('phase191-context-replay-');
		const durable = new JsonlSessionStore(join(temp.directory, 'sessions'));
		const sessions = new SessionService(durable);
		const updater = new FakeMemoryUpdater();
		const memory = new SessionMemoryService(sessions, new FakeMemoryStore(), updater);
		try {
			await memory.activate(sessionId, []);
			const original = result({
				stdout: `HEAD-SECRET${'x'.repeat(8000)}TAIL-SECRET`,
				stderr: `HEAD-ERROR${'z'.repeat(8000)}TAIL-ERROR`,
				stdoutBytes: 50000,
				stderrBytes: 60000,
				stdoutTruncated: true,
				stderrTruncated: true,
			});
			const events = [
				promptSubmittedEvent({ sessionId, prompt: 'Change the requested source.' }),
				assistantToolCallsCompletedEvent({
					sessionId,
					toolCalls: [
						{
							id: toolCallId,
							name: 'run_process',
							arguments: { program: 'project-check', args: ['source.js'] },
						},
					],
				}),
				toolCallCompletedEvent({
					sessionId,
					toolCallId,
					toolName: 'run_process',
					output: original,
				}),
				assistantMessageCompletedEvent({
					sessionId,
					content: 'The focused command returned 1; verification failed.',
				}),
			] as const;
			for (const event of events) await sessions.appendSessionEvent(event);
			const path = join(temp.directory, 'sessions', sessionId, 'events.jsonl');
			const before = await readFile(path, 'utf8');
			const state = await sessions.readSessionState(sessionId);
			const context = compiler().build(state, tools);
			const replayed = await new SessionService(
				new JsonlSessionStore(join(temp.directory, 'sessions')),
			).readSessionState(sessionId);
			expect(replayed).toEqual(state);
			expect(compiler().build(replayed, tools)).toEqual(context);
			expect(JSON.parse(state.messages.find((m) => m.role === 'tool')!.content)).toEqual(original);
			expect((await durable.readSessionEvents(sessionId))[2]).toEqual(events[2]!);
			expect(await readFile(path, 'utf8')).toBe(before);
			for (const messages of [state.messages, context.messages.slice(1)]) {
				const search = projectHistoryTurn(messages);
				expect(search).toContain('tool: run_process');
				expect(search).not.toContain('HEAD-SECRET');
				expect(search).not.toContain('TAIL-ERROR');
				expect(search).not.toContain('contextProjection');
			}
			await memory.finish(sessionId, events[0]!.messageId, events[3]!.messageId, 'test-model');
			expect(updater.inputs).toHaveLength(1);
			expect(updater.inputs[0]!.evidence.map((e) => e.text)).toEqual([
				'Change the requested source.',
				'The focused command returned 1; verification failed.',
			]);
			expect(JSON.stringify(updater.inputs)).not.toContain('HEAD-SECRET');
			expect(JSON.stringify(updater.inputs)).not.toContain('contextProjection');
			expect(memory.snapshot(sessionId)?.files).toEqual([]);
		} finally {
			memory.dispose();
			await temp.cleanup();
		}
	});
});
