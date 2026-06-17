import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { ReadWorkspaceFile } from '@/application/use-cases/file-operations/ReadWorkspaceFile';
import type { ToolDefinition } from '@/domain/Tool';

export const READ_FILE_TOOL_NAME = 'read_file';

export type ReadFileProviderOptions = {
	maxFileBytes: number;
};

type ReadFileInput = {
	path: string;
};

export class ReadFileProvider {
	constructor(
		private readonly readWorkspaceFile: ReadWorkspaceFile,
		private readonly options: ReadFileProviderOptions
	) {}

	getToolDefinition(): ToolDefinition {
		return {
			name: READ_FILE_TOOL_NAME,
			description:
				'Read a UTF-8 text file from the current workspace. Use relative paths.',
			parameters: {
				type: 'object',
				required: ['path'],
				additionalProperties: false,
				properties: {
					path: {
						type: 'string',
						description:
							'Relative path to a file in the current workspace.',
					},
				},
			},
		};
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const input = parseReadFileInput(toolInput);

		const file = await this.readWorkspaceFile.execute({
			path: input.path,
			maxFileBytes: this.options.maxFileBytes,
		});

		return {
			toolName: READ_FILE_TOOL_NAME,
			output: file,
		};
	}
}

const parseReadFileInput = (toolInput: unknown): ReadFileInput => {
	if (
		typeof toolInput !== 'object' ||
		toolInput === null ||
		!('path' in toolInput) ||
		typeof toolInput.path !== 'string' ||
		toolInput.path.trim().length === 0
	) {
		throw new Error('read_file requires a non-empty string path.');
	}

	return {
		path: toolInput.path.trim(),
	};
};
