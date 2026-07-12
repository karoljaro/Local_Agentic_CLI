import { describe, expect, test } from 'bun:test';

import { RipgrepSearch, type RipgrepCommandRunner } from './RipgrepSearch';

type CommandFixture = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

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

const createSequenceRunner = (fixtures: CommandFixture[]): RipgrepCommandRunner => {
	let index = 0;

	return async ({ onStdoutLine }) => {
		const fixture = fixtures[index];
		index += 1;

		if (fixture === undefined) {
			throw new Error('unexpected rg call');
		}

		for (const line of fixture.stdout.split('\n').filter(Boolean)) {
			if (!onStdoutLine(line)) {
				return { stderr: fixture.stderr, exitCode: 143, stoppedEarly: true };
			}
		}

		return {
			stderr: fixture.stderr,
			exitCode: fixture.exitCode,
			stoppedEarly: false,
		};
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

const successful = (stdout: string): CommandFixture => ({
	stdout,
	stderr: '',
	exitCode: 0,
});

const noMatches = (): CommandFixture => ({ stdout: '', stderr: '', exitCode: 1 });

describe('RipgrepSearch', () => {
	test('returns empty output when rg exits with code 1', async () => {
		const search = createSearch(createSequenceRunner([noMatches(), noMatches()]));

		await expect(search.search({ query: 'missing' })).resolves.toEqual({
			returnedMatches: 0,
			returnedFiles: 0,
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
			returnedMatches: 2,
			returnedFiles: 2,
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

	test('stops consuming ripgrep output after one match beyond the limit', async () => {
		let commandIndex = 0;
		let processedMatchLines = 0;
		const runCommand: RipgrepCommandRunner = async ({ onStdoutLine }) => {
			const currentIndex = commandIndex;
			commandIndex += 1;

			if (currentIndex === 1) {
				return { stderr: '', exitCode: 1, stoppedEarly: false };
			}

			for (let index = 1; index <= 10; index += 1) {
				processedMatchLines += 1;

				if (!onStdoutLine(matchLine(`src/${index}.ts`, index, 'needle'))) {
					return { stderr: '', exitCode: 143, stoppedEarly: true };
				}
			}

			return { stderr: '', exitCode: 0, stoppedEarly: false };
		};
		const search = createSearch(runCommand, { maxMatches: 2 });

		const result = await search.search({ query: 'needle' });

		expect(processedMatchLines).toBe(3);
		expect(result).toMatchObject({
			returnedMatches: 2,
			returnedFiles: 2,
			truncated: true,
		});
	});

	test('reports timeout when rg is killed by timeout', async () => {
		const search = createSearch(
			createSequenceRunner([{ stdout: '', stderr: '', exitCode: 143 }, noMatches()]),
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
			createSequenceRunner([{ stdout: '', stderr: '', exitCode: 2 }, noMatches()]),
		);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file failed: rg exited with code 2',
		);
	});

	test('bounds long rg stderr in failure messages', async () => {
		const longStderr = `${'x'.repeat(1200)}tail`;
		const search = createSearch(
			createSequenceRunner([{ stdout: '', stderr: longStderr, exitCode: 2 }, noMatches()]),
		);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			`search_file failed: ${'x'.repeat(1000)}...`,
		);
	});

	test('reports invalid rg JSON output', async () => {
		const search = createSearch(createSequenceRunner([successful('not-json\n'), noMatches()]));

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file failed: invalid rg JSON output',
		);
	});

	test('waits for both runners to finish when one search fails', async () => {
		let commandIndex = 0;
		let secondRunnerFinished = false;
		const runCommand: RipgrepCommandRunner = async () => {
			const currentIndex = commandIndex;
			commandIndex += 1;

			if (currentIndex === 0) {
				throw new Error('first search failed');
			}

			await Promise.resolve();
			secondRunnerFinished = true;
			return { stderr: '', exitCode: 1, stoppedEarly: false };
		};

		await expect(createSearch(runCommand).search({ query: 'needle' })).rejects.toThrow(
			'first search failed',
		);
		expect(secondRunnerFinished).toBe(true);
	});
});
