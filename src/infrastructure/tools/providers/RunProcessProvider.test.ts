import { describe, expect, test } from 'bun:test';
import type {
	ProcessInvocation,
	ProcessResult,
	ProcessRunnerPort,
} from '@/application/ports/ProcessRunnerPort';
import { ToolInputValidationError } from '@/application/ports/ToolExecutorPort';
import { LocalToolRegistry } from '../LocalToolExecutor';
import { runProcessTool } from './RunProcessProvider';

const result = (input: ProcessInvocation): ProcessResult => ({
	program: input.program,
	args: [...input.args],
	cwd: input.cwd,
	exitCode: 0,
	signal: null,
	timedOut: false,
	durationMs: 0,
	stdout: '',
	stderr: '',
	stdoutBytes: 0,
	stderrBytes: 0,
	stdoutTruncated: false,
	stderrTruncated: false,
});
const fixture = () => {
	const launches: ProcessInvocation[] = [];
	const runner: ProcessRunnerPort = {
		run: async (input) => {
			launches.push(input);
			return result(input);
		},
	};
	return { launches, registry: new LocalToolRegistry([runProcessTool(runner)]) };
};
const prepare = (registry: LocalToolRegistry, toolInput: unknown) =>
	registry.prepare({ toolName: 'run_process', toolInput });

describe('run_process schema and prepared authority', () => {
	test('minimal request has authoritative defaults without IO or launching a process', () => {
		const f = fixture();
		const call = prepare(f.registry, { program: 'not-installed' });
		expect(call.toolInput).toEqual({
			program: 'not-installed',
			args: [],
			cwd: '.',
			timeoutMs: 60_000,
		});
		expect(call).toMatchObject({
			requiresApproval: true,
			deduplicate: false,
			invalidatesWorkspaceCache: true,
		});
		expect(f.launches).toEqual([]);
		expect(f.registry.listTools()[0]!.parameters['required']).toEqual(['program']);
	});
	test('keeps literal args, including empty strings, spaces and interpreter syntax', async () => {
		const f = fixture();
		const args = ['', '  spaces  ', 'hello && touch file', ';', '|', '>', '$()', '`x`', '*'];
		await prepare(f.registry, { program: 'bun', args, cwd: 'src/../.', timeoutMs: 1000 }).execute();
		expect(f.launches[0]).toEqual({ program: 'bun', args, cwd: '.', timeoutMs: 1000 });
	});
	test('normalizes workspace executable paths without changing them into PATH names', () => {
		const f = fixture();
		for (const [program, normalized] of [
			['./check', './check'],
			['tools/../check', './check'],
			['./node_modules/.bin/foo', './node_modules/.bin/foo'],
			['tools/check', './tools/check'],
		])
			expect(prepare(f.registry, { program, cwd: 'src/./nested/..' }).toolInput).toMatchObject({
				program: normalized,
				cwd: 'src',
			});
		expect(f.launches).toEqual([]); // No executable existence/discovery check during preparation.
	});
	for (const timeoutMs of [1_000, 60_000, 300_000])
		test(`accepts bounded timeout ${timeoutMs}`, () => {
			expect(prepare(fixture().registry, { program: 'bun', timeoutMs }).toolInput).toMatchObject({
				timeoutMs,
			});
		});
	for (const [name, input] of [
		['missing program', {}],
		['empty program', { program: '' }],
		['whitespace program', { program: ' \n\t ' }],
		['program NUL', { program: 'b\0un' }],
		['oversize program', { program: 'a'.repeat(1025) }],
		['program UTF-8 bytes', { program: 'α'.repeat(513) }],
		['args type', { program: 'bun', args: 'test' }],
		['nonstring arg', { program: 'bun', args: [1] }],
		['args count', { program: 'bun', args: Array(129).fill('') }],
		['arg length', { program: 'bun', args: ['x'.repeat(8193)] }],
		['arg UTF-8 bytes', { program: 'bun', args: ['α'.repeat(4097)] }],
		['total payload', { program: 'bun', args: Array(5).fill('x'.repeat(8192)) }],
		['arg NUL', { program: 'bun', args: ['a\0b'] }],
		['empty cwd', { program: 'bun', cwd: ' ' }],
		['cwd NUL', { program: 'bun', cwd: 'a\0b' }],
		['cwd length', { program: 'bun', cwd: 'x'.repeat(4097) }],
		['cwd traversal', { program: 'bun', cwd: '../outside' }],
		[
			'cwd traversal cannot re-enter a synthetic root name',
			{ program: 'bun', cwd: '../__workspace__/nested' },
		],
		['cwd absolute', { program: 'bun', cwd: '/tmp' }],
		['cwd Windows absolute', { program: 'bun', cwd: 'C:/temp' }],
		['cwd backslash', { program: 'bun', cwd: 'src\\nested' }],
		['executable traversal', { program: '../outside' }],
		['executable nested escape', { program: 'tools/../../outside' }],
		['executable absolute', { program: '/usr/bin/bun' }],
		['executable Windows absolute', { program: 'C:/bun.exe' }],
		['executable UNC', { program: '\\\\server\\bun.exe' }],
		['executable drive-relative', { program: 'C:bun.exe' }],
		['timeout low', { program: 'bun', timeoutMs: 999 }],
		['timeout high', { program: 'bun', timeoutMs: 300001 }],
		['timeout fractional', { program: 'bun', timeoutMs: 1000.5 }],
		['timeout infinite', { program: 'bun', timeoutMs: Infinity }],
		...['shell', 'env', 'stdin', 'detached', 'background', 'tty', 'uid', 'gid'].map((field) => [
			field,
			{ program: 'bun', [field]: true },
		]),
	] as const)
		test(`typed preparation failure: ${name}`, () => {
			const f = fixture();
			expect(() => prepare(f.registry, input)).toThrow(ToolInputValidationError);
			expect(f.launches).toEqual([]);
		});
	test('accepts exact maximum payload; a bare shell-looking program is not classified', () => {
		const f = fixture();
		expect(
			prepare(f.registry, { program: 'hello && world', args: Array(4).fill('x'.repeat(8192)) })
				.requiresApproval,
		).toBe(true);
	});
	test('raw input and approval projection mutations cannot change bound program/args/cwd/timeout', async () => {
		const f = fixture();
		const raw = { program: 'bun', args: ['test'], cwd: './src', timeoutMs: 1000 };
		const call = prepare(f.registry, raw);
		raw.program = 'different';
		raw.args[0] = 'bad';
		raw.args.push('extra');
		raw.cwd = '.';
		raw.timeoutMs = 300000;
		const projection = call.toolInput as ProcessInvocation;
		expect(Object.isFrozen(call)).toBe(true);
		expect(Object.isFrozen(projection)).toBe(true);
		expect(Object.isFrozen(projection.args)).toBe(true);
		expect(Reflect.set(projection, 'program', 'different')).toBe(false);
		expect(Reflect.set(projection.args, '0', 'bad')).toBe(false);
		await call.execute();
		expect(f.launches).toEqual([{ program: 'bun', args: ['test'], cwd: 'src', timeoutMs: 1000 }]);
		expect(Object.isFrozen(f.launches[0])).toBe(true);
		expect(Object.isFrozen(f.launches[0]!.args)).toBe(true);
	});
});
