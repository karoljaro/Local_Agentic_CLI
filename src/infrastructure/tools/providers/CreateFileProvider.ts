import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { CreateWorkspaceFile } from '@/application/use-cases/file-operations/CreateWorkspaceFile';
import type { ToolDefinition } from '@/domain/Tool';

export const CREATE_FILE_TOOL_NAME = 'create_file';

type CreateFileProviderOptions = {
	maxFileBytes: number;
};

type CreateFileInput = {
	path: string;
	content: string;
};

export class CreateFileProvider {
	constructor(
		private readonly createWorkspaceFile: CreateWorkspaceFile,
		private readonly options: CreateFileProviderOptions,
	) {}

	getToolDefinition(): ToolDefinition {
		return {
			name: CREATE_FILE_TOOL_NAME,
			description:
				'Create a new UTF-8 file in an existing workspace directory. Fails if the file already exists.',
			requiresApproval: true,
			parameters: {
				type: 'object',
				required: ['path', 'content'],
				additionalProperties: false,
				properties: {
					path: {
						type: 'string',
						description:
							'The path for the new file, relative to the workspace root.',
					},
					content: {
						type: 'string',
						description: 'The complete content of the new file.',
					},
				},
			},
		};
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const input = parseCreateFileInput(toolInput);

		return {
			toolName: CREATE_FILE_TOOL_NAME,
			output: await this.createWorkspaceFile.execute({
				...input,
				maxFileBytes: this.options.maxFileBytes,
			}),
		};
	}
}

const parseCreateFileInput = (toolInput: unknown): CreateFileInput => {
	if (typeof toolInput !== 'object' || toolInput === null) {
		throw new Error('create_file requires an object input.');
	}

	const { path, content } = toolInput as {
		path?: unknown;
		content?: unknown;
	};

	if (typeof path !== 'string' || path.trim().length === 0) {
		throw new Error('create_file requires a non-empty string path.');
	}

	if (typeof content !== 'string') {
		throw new Error('create_file requires string content.');
	}

	return {
		path: path.trim(),
		content,
	};
};
