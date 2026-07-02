import { describe, expect, test } from 'bun:test';

import {
	RipgrepSearch,
	type RipgrepCommandRunner,
} from './RipgrepSearch';

type CommandResult = Awaited<ReturnType<RipgrepCommandRunner>>;

const createSearch = (
	runCommand: RipgrepCommandRunner,
	options: Partial<{
		maxMatches: number;
		maxMatchTextLength: number;
		timeoutMs: number;
	}> = {},
): RipgrepSearch => {
	return new RipgrepSearch({
		workspaceRoot: '/workspace',
		timeoutMs: options.timeoutMs ?? 5000,
		maxMatches: options.maxMatches ?? 50,
		maxMatchTextLength: options.maxMatchTextLength ?? 300,
		runCommand,
	});
};

const createSequenceRunner = (
	results: CommandResult[],
): RipgrepCommandRunner => {
	let index = 0;

	return async () => {
		const result = results[index];
		index += 1;

		if (result === undefined) {
			throw new Error('unexpected rg call');
		}

		return result;
	};
};

const matchLine = (path: string, line: number, text: string): string =>
	JSON.stringify({
		type: 'match',
		data: {
			path: { text: `./${path}` },
			line_number: line,
			lines: { text: `${text}\n` },
		},
	});

const successful = (stdout: string): CommandResult => ({
	stdout,
	stderr: '',
	exitCode: 0,
});

describe('RipgrepSearch', () => {
	test('returns empty output when rg exits with code 1', async () => {
		const search = createSearch(
			createSequenceRunner([
				{ stdout: '', stderr: '', exitCode: 1 },
				{ stdout: '', stderr: '', exitCode: 1 },
			]),
		);

		await expect(search.search({ query: 'missing' })).resolves.toEqual({
			matchCount: 0,
			fileCount: 0,
			matches: [],
			truncated: false,
		});
	});

	test('sorts matches after combining normal files and safe env files', async () => {
		const search = createSearch(
			createSequenceRunner([
				successful(`${matchLine('src/z.ts', 1, 'needle z')}\n`),
				successful(`${matchLine('.env.example', 1, 'needle env')}\n`),
			]),
		);

		await expect(search.search({ query: 'needle' })).resolves.toEqual({
			matchCount: 2,
			fileCount: 2,
			matches: [
				{
					path: '.env.example',
					line: 1,
					text: 'needle env',
				},
				{
					path: 'src/z.ts',
					line: 1,
					text: 'needle z',
				},
			],
			truncated: false,
		});
	});

	test('reports timeout when rg is killed by timeout', async () => {
		const search = createSearch(
			createSequenceRunner([
				{ stdout: '', stderr: '', exitCode: 143 },
				{ stdout: '', stderr: '', exitCode: 1 },
			]),
			{ timeoutMs: 250 },
		);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file timed out after 250ms.',
		);
	});

	test('reports missing ripgrep binary', async () => {
		const runCommand: RipgrepCommandRunner = async () => {
			throw Object.assign(new Error('spawn failed'), { code: 'ENOENT' });
		};

		const search = createSearch(runCommand);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file failed: ripgrep binary not found',
		);
	});

	test('uses exit code when rg fails without stderr', async () => {
		const search = createSearch(
			createSequenceRunner([
				{ stdout: '', stderr: '', exitCode: 2 },
				{ stdout: '', stderr: '', exitCode: 1 },
			]),
		);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file failed: rg exited with code 2',
		);
	});

	test('bounds long rg stderr in failure messages', async () => {
		const longStderr = `${'x'.repeat(1200)}tail`;
		const search = createSearch(
			createSequenceRunner([
				{ stdout: '', stderr: longStderr, exitCode: 2 },
				{ stdout: '', stderr: '', exitCode: 1 },
			]),
		);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			`search_file failed: ${'x'.repeat(1000)}...`,
		);
	});

	test('reports invalid rg JSON output', async () => {
		const search = createSearch(
			createSequenceRunner([
				successful('not-json\n'),
				{ stdout: '', stderr: '', exitCode: 1 },
			]),
		);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file failed: invalid rg JSON output',
		);
	});
});
