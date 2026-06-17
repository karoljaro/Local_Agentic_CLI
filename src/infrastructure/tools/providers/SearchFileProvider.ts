import { resolve } from 'node:path';

import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';
import { searchWithRipgrep } from '@/infrastructure/tools/ripgrep/RipgrepSearch';

export const SEARCH_FILE_TOOL_NAME = 'search_file';

const TOOL_DEFINITION = {
	name: SEARCH_FILE_TOOL_NAME,
	description:
		'Search workspace files for exact text. Use | for alternatives. Returns matching paths, line numbers, and excerpts.',
	parameters: {
		type: 'object',
		required: ['query'],
		additionalProperties: false,
		properties: {
			query: {
				type: 'string',
				description: 'Exact text or | separated alternatives.',
			},
		},
	},
} satisfies ToolDefinition;

export type SearchFileProviderOptions = {
	workspaceRoot: string;
	maxSearchMatches?: number;
	maxMatchTextLength?: number;
	searchTimeoutMs?: number;
};

type SearchOptions = {
	workspaceRoot: string;
	maxMatches: number;
	maxMatchTextLength: number;
	timeoutMs: number;
};

export class SearchFileProvider {
	private readonly options: SearchOptions;

	constructor(options: SearchFileProviderOptions) {
		this.options = {
			workspaceRoot: resolve(options.workspaceRoot),
			maxMatches: options.maxSearchMatches ?? 50,
			maxMatchTextLength: options.maxMatchTextLength ?? 300,
			timeoutMs: options.searchTimeoutMs ?? 5_000,
		};

		if (
			[
				this.options.maxMatches,
				this.options.maxMatchTextLength,
				this.options.timeoutMs,
			].some((value) => !Number.isFinite(value) || value <= 0)
		) {
			throw new Error('Search limits must be positive numbers.');
		}
	}

	getToolDefinition(): ToolDefinition {
		return TOOL_DEFINITION;
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const query = parseQuery(toolInput);

		return {
			toolName: SEARCH_FILE_TOOL_NAME,
			output: await searchWithRipgrep({ query, ...this.options }),
		};
	}
}

const parseQuery = (input: unknown): string => {
	if (
		typeof input !== 'object' ||
		input === null ||
		!('query' in input) ||
		typeof input.query !== 'string' ||
		input.query.trim() === ''
	) {
		throw new Error('search_file requires a non-empty string query.');
	}

	return input.query.trim();
};