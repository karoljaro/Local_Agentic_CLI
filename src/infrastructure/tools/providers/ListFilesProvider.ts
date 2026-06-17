import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { ListWorkspaceFiles } from '@/application/use-cases/file-operations/ListWorkspaceFiles';
import type { ToolDefinition } from '@/domain/Tool';

export const LIST_FILES_TOOL_NAME = 'list_files';

type ListFilesProviderOptions = {
	maxEntries: number;
};

type ListFilesInput = {
	path?: string;
};

const TOOL_DEFINITION = {
	name: LIST_FILES_TOOL_NAME,
	description:
		'Recursively list file paths in the workspace or under an optional relative path. Use this to discover project structure or locate files by name or extension. Do not use it to search file contents; use search_file instead.',
	parameters: {
		type: 'object',
		required: [],
		additionalProperties: false,
		properties: {
			path: {
				type: 'string',
				description:
					'Optional relative file or directory path. Defaults to the workspace root.',
			},
		},
	},
} satisfies ToolDefinition;

export class ListFilesProvider {
	private readonly maxEntries: number;

	constructor(
		private readonly listWorkspaceFiles: ListWorkspaceFiles,
		options: ListFilesProviderOptions
	) {
		if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) {
			throw new Error('Max list entries must be a positive integer.');
		}

		this.maxEntries = options.maxEntries;
	}

	getToolDefinition(): ToolDefinition {
		return TOOL_DEFINITION;
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const input = parseListFilesInput(toolInput);

		return {
			toolName: LIST_FILES_TOOL_NAME,
			output: await this.listWorkspaceFiles.execute({
				...input,
				maxEntries: this.maxEntries,
			}),
		};
	}
}

const parseListFilesInput = (toolInput: unknown): ListFilesInput => {
	if (toolInput === undefined || toolInput === null) {
		return {};
	}

	if (typeof toolInput !== 'object' || Array.isArray(toolInput)) {
		throw new Error('list_files requires an object input.');
	}

	if (!('path' in toolInput) || toolInput.path === undefined) {
		return {};
	}

	if (
		typeof toolInput.path !== 'string' ||
		toolInput.path.trim().length === 0
	) {
		throw new Error('list_files path must be a non-empty string.');
	}

	return {
		path: toolInput.path.trim(),
	};
};
