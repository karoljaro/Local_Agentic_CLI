import { resolve } from 'node:path';

import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';
import { searchWithRipgrep } from '@/infrastructure/tools/ripgrep/RipgrepSearch';

export const SEARCH_FILE_TOOL_NAME = 'search_file';

const DEFAULT_MAX_SEARCH_MATCHES = 50;
const DEFAULT_MAX_MATCH_TEXT_LENGTH = 300;
const DEFAULT_SEARCH_TIMEOUT_MS = 5_000;
const MAX_FALLBACK_TOKENS = 8;

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
							'Exact text to search for. Use simple | alternatives for related terms.',
					},
				},
			},
		};
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const input = parseSearchFileInput(toolInput);

		return {
			toolName: SEARCH_FILE_TOOL_NAME,
			output: await searchWithRipgrep({
				query: input.query,
				queryGroups: buildQueryGroups(input.query),
				workspaceRoot: this.workspaceRoot,
				timeoutMs: this.searchTimeoutMs,
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

const buildQueryGroups = (query: string): string[][] => {
	const terms = splitQueryTerms(query);

	if (query.includes('|')) {
		return terms.length > 0 ? [terms] : [[query]];
	}

	return terms.length > 1 ? [[query], terms] : [[query]];
};

const splitQueryTerms = (query: string): string[] => {
	const seen = new Set<string>();

	return query
		.split(/[\s|]+/)
		.map(cleanSearchToken)
		.filter((token) => token.length >= 3)
		.filter((token) => {
			const key = token.toLowerCase();

			if (seen.has(key)) {
				return false;
			}

			seen.add(key);
			return true;
		})
		.sort((left, right) => right.length - left.length)
		.slice(0, MAX_FALLBACK_TOKENS);
};

const cleanSearchToken = (token: string): string => {
	return token.replace(/^[^\w./-]+|[^\w./-]+$/g, '');
};
