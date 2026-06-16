import { isAbsolute, relative, resolve } from 'node:path';
import { rgPath } from '@vscode/ripgrep';

import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';

export const SEARCH_FILE_TOOL_NAME = 'search_file';

const DEFAULT_MAX_SEARCH_MATCHES = 50;
const DEFAULT_MAX_MATCH_TEXT_LENGTH = 300;
const DEFAULT_SEARCH_TIMEOUT_MS = 5_000;
const MAX_TOP_FILES = 10;

export type SearchFileProviderOptions = {
	workspaceRoot: string;
	maxSearchMatches?: number;
	maxMatchTextLength?: number;
	searchTimeoutMs?: number;
};

export type SearchFileToolInput = {
	query: string;
};

export class SearchFileProvider {
	private readonly workspaceRoot: string;
	private readonly maxSearchMatches: number;
	private readonly maxMatchTextLength: number;
	private readonly searchTimeoutMs: number;

	constructor(options: SearchFileProviderOptions) {
		this.workspaceRoot = resolve(options.workspaceRoot);
		this.maxSearchMatches =
			options.maxSearchMatches ?? DEFAULT_MAX_SEARCH_MATCHES;
		this.maxMatchTextLength =
			options.maxMatchTextLength ?? DEFAULT_MAX_MATCH_TEXT_LENGTH;
		this.searchTimeoutMs =
			options.searchTimeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS;

		if (this.maxSearchMatches <= 0) {
			throw new Error('Max search matches must be greater than zero.');
		}

		if (this.maxMatchTextLength <= 0) {
			throw new Error('Max match text length must be greater than zero.');
		}

		if (this.searchTimeoutMs <= 0) {
			throw new Error('Search timeout must be greater than zero.');
		}
	}

	getToolDefinition(): ToolDefinition {
		return {
			name: SEARCH_FILE_TOOL_NAME,
			description:
				'Find relevant content in a workspace. Use this tool to locate files, code, symbols, strings, configuration values, TODOs, errors, logs, and patterns before opening or reading files. Returns matching file paths, line numbers, and excerpts.',
			parameters: {
				type: 'object',
				required: ['query'],
				additionalProperties: false,
				properties: {
					query: {
						type: 'string',
						description:
							'Literal text to search for in the current workspace.',
					},
				},
			},
		};
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const input = parseSearchFileInput(toolInput);
		const result = await runRipgrep({
			query: input.query,
			workspaceRoot: this.workspaceRoot,
			timeoutMs: this.searchTimeoutMs,
		});

		if (result.exitCode === 1) {
			return {
				toolName: SEARCH_FILE_TOOL_NAME,
				output: createEmptySearchOutput(input.query),
			};
		}

		if (result.exitCode !== 0) {
			throw new Error(
				`search_file failed: ${result.stderr.trim() || `rg exited with code ${result.exitCode}`}`
			);
		}

		return {
			toolName: SEARCH_FILE_TOOL_NAME,
			output: parseRipgrepJsonOutput({
				query: input.query,
				stdout: result.stdout,
				workspaceRoot: this.workspaceRoot,
				maxMatches: this.maxSearchMatches,
				maxMatchTextLength: this.maxMatchTextLength,
			}),
		};
	}
}

const parseSearchFileInput = (toolInput: unknown): SearchFileToolInput => {
	if (
		typeof toolInput !== 'object' ||
		toolInput === null ||
		!('query' in toolInput) ||
		typeof toolInput.query !== 'string' ||
		toolInput.query.trim().length === 0
	) {
		throw new Error('search_file requires a non-empty string query.');
	}

	return {
		query: toolInput.query.trim(),
	};
};

type RipgrepRunInput = {
	query: string;
	workspaceRoot: string;
	timeoutMs: number;
};

type RipgrepRunResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

const runRipgrep = async (
	input: RipgrepRunInput
): Promise<RipgrepRunResult> => {
	const subprocess = Bun.spawn({
		cmd: [
			rgPath,
			'--json',
			'--fixed-strings',
			'--color=never',
			'--max-columns',
			'500',
			'--glob',
			'!node_modules/**',
			'--glob',
			'!.git/**',
			'--glob',
			'!.agent/**',
			input.query,
			input.workspaceRoot,
		],
		stdout: 'pipe',
		stderr: 'pipe',
	});

	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		subprocess.kill();
	}, input.timeoutMs);

	try {
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(subprocess.stdout).text(),
			new Response(subprocess.stderr).text(),
			subprocess.exited,
		]);

		if (timedOut) {
			throw new Error(
				`search_file timed out after ${input.timeoutMs}ms.`
			);
		}

		return { stdout, stderr, exitCode };
	} finally {
		clearTimeout(timeout);
	}
};

type SearchFileOutput = {
	query: string;
	matchCount: number;
	fileCount: number;
	topFiles: SearchFileTopFile[];
	matches: SearchFileMatch[];
	truncated: boolean;
};

type SearchFileTopFile = {
	path: string;
	matchCount: number;
};

type SearchFileMatch = {
	path: string;
	line: number;
	text: string;
};

type RipgrepJsonOutputInput = {
	query: string;
	stdout: string;
	workspaceRoot: string;
	maxMatches: number;
	maxMatchTextLength: number;
};

type RipgrepJsonMatchEvent = {
	type: 'match';
	data?: {
		path?: {
			text?: string;
		};
		lines?: {
			text?: string;
		};
		line_number?: number;
	};
};

const parseRipgrepJsonOutput = (
	input: RipgrepJsonOutputInput
): SearchFileOutput => {
	const matches: SearchFileMatch[] = [];
	const fileMatchCounts = new Map<string, number>();
	let matchCount = 0;

	for (const line of input.stdout.split('\n')) {
		if (line.trim().length === 0) {
			continue;
		}

		const event = JSON.parse(line) as { type?: string };

		if (event.type !== 'match') {
			continue;
		}

		const matchEvent = event as RipgrepJsonMatchEvent;
		const rawPath = matchEvent.data?.path?.text;
		const lineNumber = matchEvent.data?.line_number;
		const text = matchEvent.data?.lines?.text;

		if (
			rawPath === undefined ||
			lineNumber === undefined ||
			text === undefined
		) {
			continue;
		}

		const path = toWorkspaceRelativePath(input.workspaceRoot, rawPath);
		fileMatchCounts.set(path, (fileMatchCounts.get(path) ?? 0) + 1);
		matchCount += 1;

		if (matches.length >= input.maxMatches) {
			continue;
		}

		matches.push({
			path,
			line: lineNumber,
			text: truncateText(text.trimEnd(), input.maxMatchTextLength),
		});
	}

	return {
		query: input.query,
		matchCount,
		fileCount: fileMatchCounts.size,
		topFiles: [...fileMatchCounts.entries()]
			.map(([path, count]) => ({ path, matchCount: count }))
			.sort((left, right) => right.matchCount - left.matchCount)
			.slice(0, MAX_TOP_FILES),
		matches,
		truncated: matchCount > matches.length,
	};
};

const createEmptySearchOutput = (query: string): SearchFileOutput => {
	return {
		query,
		matchCount: 0,
		fileCount: 0,
		topFiles: [],
		matches: [],
		truncated: false,
	};
};

const toWorkspaceRelativePath = (
	workspaceRoot: string,
	path: string
): string => {
	const absolutePath = isAbsolute(path) ? path : resolve(workspaceRoot, path);

	return isPathInside(workspaceRoot, absolutePath)
		? relative(workspaceRoot, absolutePath)
		: path;
};

const isPathInside = (parentPath: string, childPath: string): boolean => {
	const relativePath = relative(parentPath, childPath);

	return (
		relativePath.length === 0 ||
		(!relativePath.startsWith('..') && !isAbsolute(relativePath))
	);
};

const truncateText = (text: string, maxLength: number): string => {
	return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
};
