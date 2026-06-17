import { rgPath } from '@vscode/ripgrep';
import { isAbsolute, relative, resolve } from 'node:path';

import { isPathInside } from '@/infrastructure/file-system/isPathInside';

const MAX_TOP_FILES = 10;

export type SearchFileOutput = {
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

type SearchWithRipgrepInput = {
	query: string;
	queryGroups: string[][];
	workspaceRoot: string;
	timeoutMs: number;
	maxMatches: number;
	maxMatchTextLength: number;
};

export const searchWithRipgrep = async (
	input: SearchWithRipgrepInput,
): Promise<SearchFileOutput> => {
	for (const queries of input.queryGroups) {
		const result = await runRipgrep({
			queries,
			workspaceRoot: input.workspaceRoot,
			timeoutMs: input.timeoutMs,
		});

		if (result.exitCode === 0) {
			return parseRipgrepJsonOutput({
				query: input.query,
				stdout: result.stdout,
				workspaceRoot: input.workspaceRoot,
				maxMatches: input.maxMatches,
				maxMatchTextLength: input.maxMatchTextLength,
			});
		}

		if (result.exitCode !== 1) {
			throw new Error(
				`search_file failed: ${result.stderr.trim() || `rg exited with code ${result.exitCode}`}`,
			);
		}
	}

	return createEmptySearchOutput(input.query);
};

type RipgrepRunInput = {
	queries: string[];
	workspaceRoot: string;
	timeoutMs: number;
};

type RipgrepRunResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

const runRipgrep = async (
	input: RipgrepRunInput,
): Promise<RipgrepRunResult> => {
	const queryArgs = input.queries.flatMap((query) => ['--regexp', query]);
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
			...queryArgs,
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
			throw new Error(`search_file timed out after ${input.timeoutMs}ms.`);
		}

		return { stdout, stderr, exitCode };
	} finally {
		clearTimeout(timeout);
	}
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
	input: RipgrepJsonOutputInput,
): SearchFileOutput => {
	const matches: SearchFileMatch[] = [];
	const fileMatchCounts = new Map<string, number>();
	const seenMatches = new Set<string>();
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
		const matchKey = `${path}\0${lineNumber}\0${text}`;

		if (seenMatches.has(matchKey)) {
			continue;
		}

		seenMatches.add(matchKey);
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
			.sort(
				(left, right) =>
					right.matchCount - left.matchCount ||
					left.path.localeCompare(right.path),
			)
			.slice(0, MAX_TOP_FILES),
		matches: matches.sort(
			(left, right) =>
				(fileMatchCounts.get(right.path) ?? 0) -
					(fileMatchCounts.get(left.path) ?? 0) ||
				left.path.localeCompare(right.path) ||
				left.line - right.line,
		),
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
	path: string,
): string => {
	const absolutePath = isAbsolute(path) ? path : resolve(workspaceRoot, path);

	return isPathInside(workspaceRoot, absolutePath)
		? relative(workspaceRoot, absolutePath)
		: path;
};

const truncateText = (text: string, maxLength: number): string => {
	return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
};
