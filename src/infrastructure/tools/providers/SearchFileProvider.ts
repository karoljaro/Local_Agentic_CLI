import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { SearchWorkspaceFiles } from '@/application/use-cases/file-operations/SearchWorkspaceFiles';
import type { ToolDefinition } from '@/domain/Tool';

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

export class SearchFileProvider {
	constructor(private readonly searchWorkspaceFiles: SearchWorkspaceFiles) {}

	getToolDefinition(): ToolDefinition {
		return TOOL_DEFINITION;
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const query = parseQuery(toolInput);

		return {
			toolName: SEARCH_FILE_TOOL_NAME,
			output: await this.searchWorkspaceFiles.execute({ query }),
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
