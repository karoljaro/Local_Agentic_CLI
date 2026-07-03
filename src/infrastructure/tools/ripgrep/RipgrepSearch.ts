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
	globs: string[];
	runCommand: RipgrepCommandRunner;
};

type RipgrepCommandInput = {
	cmd: string[];
	cwd: string;
	timeoutMs: number;
};

type RipgrepCommandOutput = {
	stdout: string;
	stderr: string;
	exitCode: number;
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

	const outputs = await Promise.all([
		// Search normal files, but exclude every .env variant.
		runRipgrep({
			patterns,
			workspaceRoot,
			timeoutMs,
			runCommand,
			globs: ['!**/.env*', ...EXCLUDED_GLOBS],
		}),
		// Search only explicitly safe development/example env files.
		runRipgrep({
			patterns,
			workspaceRoot,
			timeoutMs,
			runCommand,
			globs: [...SAFE_ENV_GLOBS, ...EXCLUDED_GLOBS],
		}),
	]);

	const matches: SearchWorkspaceMatch[] = [];
	const files = new Set<string>();

	for (const stdout of outputs) {
		for (const line of stdout.split('\n')) {
			if (line.length === 0) {
				continue;
			}

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
				continue;
			}

			const relativePath = path.replace(/^\.[\\/]/, '');

			files.add(relativePath);
			matches.push({
				path: relativePath,
				line: lineNumber,
				text: truncate(text.trimEnd(), maxMatchTextLength),
			});
		}
	}

	matches.sort(compareMatches);
	const visibleMatches = matches.slice(0, maxMatches);

	return {
		matchCount: matches.length,
		fileCount: files.size,
		matches: visibleMatches,
		truncated: matches.length > visibleMatches.length,
	};
};

const runRipgrep = async ({
	patterns,
	workspaceRoot,
	timeoutMs,
	globs,
	runCommand,
}: RipgrepRunInput): Promise<string> => {
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
	let result: RipgrepCommandOutput;

	try {
		result = await runCommand({
			cmd: command,
			cwd: workspaceRoot,
			timeoutMs,
		});
	} catch (caughtError) {
		if (isNodeErrorCode(caughtError, 'ENOENT')) {
			throw new Error(`search_file failed: ripgrep binary not found: ${rgPath}`);
		}

		throw caughtError;
	}

	const { stdout, stderr, exitCode } = result;

	if (exitCode === 143) {
		throw new Error(`search_file timed out after ${timeoutMs}ms.`);
	}

	if (exitCode === 1) {
		return '';
	}

	if (exitCode !== 0) {
		const message = stderr.trim()
			? truncate(stderr.trim(), MAX_STDERR_LENGTH)
			: `rg exited with code ${exitCode}`;

		throw new Error(`search_file failed: ${message}`);
	}

	return stdout;
};

const runRipgrepCommand: RipgrepCommandRunner = async ({ cmd, cwd, timeoutMs }) => {
	const process = Bun.spawn({
		cmd,
		cwd,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: timeoutMs,
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);

	return { stdout, stderr, exitCode };
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
