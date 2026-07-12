import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
	SearchWorkspaceInput,
	SearchWorkspaceMatch,
	SearchWorkspaceOutput,
	WorkspaceSearchPort,
} from '@/application/ports/WorkspaceSearchPort';

export type RipgrepSearchOptions = {
	workspaceRoot: string;
	timeoutMs: number;
	maxMatches: number;
	maxMatchTextLength: number;
	runCommand?: RipgrepCommandRunner;
};

type RipgrepRunInput = {
	patterns: string[];
	workspaceRoot: string;
	timeoutMs: number;
	maxMatches: number;
	maxMatchTextLength: number;
	globs: string[];
	runCommand: RipgrepCommandRunner;
};

export type RipgrepCommandInput = {
	cmd: string[];
	cwd: string;
	timeoutMs: number;
	onStdoutLine: (line: string) => boolean;
};

export type RipgrepCommandOutput = {
	stderr: string;
	exitCode: number;
	stoppedEarly: boolean;
};

export type RipgrepCommandRunner = (input: RipgrepCommandInput) => Promise<RipgrepCommandOutput>;

type RipgrepMatchEvent = {
	type?: string;
	data?: {
		path?: { text?: string };
		lines?: { text?: string };
		line_number?: number;
	};
};

type BoundedSearchResult = {
	matches: SearchWorkspaceMatch[];
	truncated: boolean;
};

const EXCLUDED_GLOBS = ['!**/node_modules/**', '!**/.git/**', '!**/.agent/**'];
const SAFE_ENV_GLOBS = ['**/.env.development', '**/.env.dev', '**/.env.example'];
const MAX_STDERR_LENGTH = 1000;
const rgPath = resolveRipgrepPath();

export class RipgrepSearch implements WorkspaceSearchPort {
	constructor(private readonly options: RipgrepSearchOptions) {}

	search(input: SearchWorkspaceInput): Promise<SearchWorkspaceOutput> {
		return searchWithRipgrep(input.query, this.options);
	}
}

const searchWithRipgrep = async (
	query: string,
	{
		workspaceRoot,
		timeoutMs,
		maxMatches,
		maxMatchTextLength,
		runCommand = runRipgrepCommand,
	}: RipgrepSearchOptions,
): Promise<SearchWorkspaceOutput> => {
	const alternatives = query
		.split('|')
		.map((part) => part.trim())
		.filter(Boolean);
	const patterns = [...new Set(alternatives.length > 0 ? alternatives : [query])];
	const commonInput = {
		patterns,
		workspaceRoot,
		timeoutMs,
		maxMatches,
		maxMatchTextLength,
		runCommand,
	};

	const settledResults = await Promise.allSettled([
		runRipgrep({
			...commonInput,
			globs: ['!**/.env*', ...EXCLUDED_GLOBS],
		}),
		runRipgrep({
			...commonInput,
			globs: [...SAFE_ENV_GLOBS, ...EXCLUDED_GLOBS],
		}),
	]);
	const failedResult = settledResults.find(
		(result): result is PromiseRejectedResult => result.status === 'rejected',
	);

	if (failedResult !== undefined) {
		throw failedResult.reason;
	}

	const results = settledResults
		.filter(
			(result): result is PromiseFulfilledResult<BoundedSearchResult> =>
				result.status === 'fulfilled',
		)
		.map((result) => result.value);

	const matches = results.flatMap((result) => result.matches).sort(compareMatches);
	const visibleMatches = matches.slice(0, maxMatches);
	const returnedFiles = new Set(visibleMatches.map((match) => match.path)).size;

	return {
		returnedMatches: visibleMatches.length,
		returnedFiles,
		matches: visibleMatches,
		truncated: results.some((result) => result.truncated) || matches.length > visibleMatches.length,
	};
};

const runRipgrep = async ({
	patterns,
	workspaceRoot,
	timeoutMs,
	maxMatches,
	maxMatchTextLength,
	globs,
	runCommand,
}: RipgrepRunInput): Promise<BoundedSearchResult> => {
	const command = [
		rgPath,
		'--json',
		'--fixed-strings',
		'--hidden',
		'--color=never',
		'--sort=path',
		'--max-columns=500',
		...globs.map((glob) => `--glob=${glob}`),
		...patterns.flatMap((pattern) => ['--regexp', pattern]),
		'.',
	];
	const matches: SearchWorkspaceMatch[] = [];
	let result: RipgrepCommandOutput;

	try {
		result = await runCommand({
			cmd: command,
			cwd: workspaceRoot,
			timeoutMs,
			onStdoutLine: (line) => {
				const match = parseRipgrepMatch(line, maxMatchTextLength);

				if (match !== undefined) {
					matches.push(match);
				}

				return matches.length <= maxMatches;
			},
		});
	} catch (caughtError) {
		if (isNodeErrorCode(caughtError, 'ENOENT')) {
			throw new Error(`search_file failed: ripgrep binary not found: ${rgPath}`);
		}

		throw caughtError;
	}

	if (result.exitCode === 143 && !result.stoppedEarly) {
		throw new Error(`search_file timed out after ${timeoutMs}ms.`);
	}

	if (result.exitCode !== 0 && result.exitCode !== 1 && !result.stoppedEarly) {
		const message = result.stderr.trim()
			? truncate(result.stderr.trim(), MAX_STDERR_LENGTH)
			: `rg exited with code ${result.exitCode}`;

		throw new Error(`search_file failed: ${message}`);
	}

	return {
		matches: matches.slice(0, maxMatches),
		truncated: result.stoppedEarly || matches.length > maxMatches,
	};
};

const runRipgrepCommand: RipgrepCommandRunner = async ({ cmd, cwd, timeoutMs, onStdoutLine }) => {
	const subprocess = Bun.spawn({
		cmd,
		cwd,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: timeoutMs,
	});
	const stderrPromise = new Response(subprocess.stderr).text();
	const exitCodePromise = subprocess.exited;
	let stoppedEarly = false;
	let consumerError: unknown;

	try {
		stoppedEarly = await consumeLines(subprocess.stdout, onStdoutLine);
	} catch (caughtError) {
		consumerError = caughtError;
	}

	if (stoppedEarly || consumerError !== undefined) {
		subprocess.kill();
	}

	const [stderr, exitCode] = await Promise.all([stderrPromise, exitCodePromise]);

	if (consumerError !== undefined) {
		throw consumerError;
	}

	return { stderr, exitCode, stoppedEarly };
};

const consumeLines = async (
	stream: ReadableStream<Uint8Array>,
	onLine: (line: string) => boolean,
): Promise<boolean> => {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (line.length > 0 && !onLine(line)) {
					return true;
				}
			}
		}

		buffer += decoder.decode();

		return buffer.length > 0 && !onLine(buffer);
	} finally {
		await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
};

const parseRipgrepMatch = (
	line: string,
	maxMatchTextLength: number,
): SearchWorkspaceMatch | undefined => {
	const event = parseRipgrepJsonLine(line);
	const path = event.data?.path?.text;
	const lineNumber = event.data?.line_number;
	const text = event.data?.lines?.text;

	if (
		event.type !== 'match' ||
		path === undefined ||
		lineNumber === undefined ||
		text === undefined
	) {
		return undefined;
	}

	return {
		path: path.replace(/^\.[\\/]/, ''),
		line: lineNumber,
		text: truncate(text.trimEnd(), maxMatchTextLength),
	};
};

const parseRipgrepJsonLine = (line: string): RipgrepMatchEvent => {
	try {
		return JSON.parse(line) as RipgrepMatchEvent;
	} catch (caughtError) {
		const message = caughtError instanceof Error ? caughtError.message : String(caughtError);

		throw new Error(`search_file failed: invalid rg JSON output: ${message}`);
	}
};

const compareMatches = (left: SearchWorkspaceMatch, right: SearchWorkspaceMatch): number => {
	const pathOrder = left.path.localeCompare(right.path);

	if (pathOrder !== 0) {
		return pathOrder;
	}

	if (left.line !== right.line) {
		return left.line - right.line;
	}

	return left.text.localeCompare(right.text);
};

const isNodeErrorCode = (error: unknown, code: string): boolean => {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === code
	);
};

const truncate = (text: string, maxLength: number): string =>
	text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;

// TODO: Find better way to resolve the ripgrep binary path, especially when running in a packaged environment.
function resolveRipgrepPath(): string {
	const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';
	const entrypoint = process.argv[1];
	const directories = [dirname(process.execPath)];

	if (entrypoint !== undefined) {
		try {
			directories.unshift(dirname(realpathSync(entrypoint)));
		} catch {
			// Fall back to the executable or package path.
		}
	}

	for (const directory of directories) {
		const candidate = join(directory, binaryName);

		if (existsSync(candidate)) {
			return candidate;
		}
	}

	const packageModulePath = fileURLToPath(import.meta.resolve('@vscode/ripgrep-universal'));

	return resolve(
		dirname(packageModulePath),
		'..',
		'bin',
		`${process.platform}-${process.arch}`,
		binaryName,
	);
}
