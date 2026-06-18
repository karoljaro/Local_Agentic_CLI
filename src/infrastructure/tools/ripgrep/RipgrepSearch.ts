import { rgPath } from '@vscode/ripgrep';

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
};

type RipgrepRunInput = {
	patterns: string[];
	workspaceRoot: string;
	timeoutMs: number;
	globs: string[];
};

type RipgrepMatchEvent = {
	type?: string;
	data?: {
		path?: { text?: string };
		lines?: { text?: string };
		line_number?: number;
	};
};

const EXCLUDED_GLOBS = [
	'!**/node_modules/**',
	'!**/.git/**',
	'!**/.agent/**',
];

const SAFE_ENV_GLOBS = [
	'**/.env.development',
	'**/.env.dev',
	'**/.env.example',
];

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
			globs: ['!**/.env*', ...EXCLUDED_GLOBS],
		}),
		// Search only explicitly safe development/example env files.
		runRipgrep({
			patterns,
			workspaceRoot,
			timeoutMs,
			globs: [...SAFE_ENV_GLOBS, ...EXCLUDED_GLOBS],
		}),
	]);

	const matches: SearchWorkspaceMatch[] = [];
	const files = new Set<string>();
	let matchCount = 0;

	for (const stdout of outputs) {
		for (const line of stdout.split('\n')) {
			if (line.length === 0) {
				continue;
			}

			const event = JSON.parse(line) as RipgrepMatchEvent;
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

			matchCount += 1;
			files.add(relativePath);

			// Count every match, but retain only the configured result window.
			if (matches.length < maxMatches) {
				matches.push({
					path: relativePath,
					line: lineNumber,
					text: truncate(text.trimEnd(), maxMatchTextLength),
				});
			}
		}
	}

	return {
		matchCount,
		fileCount: files.size,
		matches,
		truncated: matchCount > matches.length,
	};
};

const runRipgrep = async ({
	patterns,
	workspaceRoot,
	timeoutMs,
	globs,
}: RipgrepRunInput): Promise<string> => {
	const process = Bun.spawn({
		cmd: [
			rgPath,
			'--json',
			'--fixed-strings',
			'--hidden',
			'--color=never',
			'--max-columns=500',
			...globs.map((glob) => `--glob=${glob}`),
			...patterns.flatMap((pattern) => ['--regexp', pattern]),
			'.',
		],
		cwd: workspaceRoot,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: timeoutMs,
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);

	if (exitCode === 143) {
		throw new Error(`search_file timed out after ${timeoutMs}ms.`);
	}

	if (exitCode === 1) {
		return '';
	}

	if (exitCode !== 0) {
		throw new Error(
			`search_file failed: ${stderr.trim() || `rg exited with code ${exitCode}`}`,
		);
	}

	return stdout;
};

const truncate = (text: string, maxLength: number): string =>
	text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
