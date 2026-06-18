import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { EditWorkspaceFile } from '@/application/use-cases/file-operations/EditWorkspaceFile';
import type { ToolDefinition } from '@/domain/Tool';

export const EDIT_FILE_TOOL_NAME = 'edit_file';

type EditFileProviderOptions = {
	maxFileBytes: number;
};

type EditFileInput = {
	path: string;
	oldText: string;
	newText: string;
};

export class EditFileProvider {
	private readonly maxFileBytes: number;

	constructor(
		private readonly editWorkspaceFile: EditWorkspaceFile,
		options: EditFileProviderOptions,
	) {
		this.maxFileBytes = options.maxFileBytes;

		if (this.maxFileBytes <= 0) {
			throw new Error('Max file size must be greater than zero.');
		}
	}

	getToolDefinition(): ToolDefinition {
		return {
			name: EDIT_FILE_TOOL_NAME,
			description:
				'Replace exact text in a UTF-8 file in the current workspace. Use this after reading the target file.',
			requiresApproval: true,
			parameters: {
				type: 'object',
				required: ['path', 'oldText', 'newText'],
				additionalProperties: false,
				properties: {
					path: {
						type: 'string',
						description:
							'The path to the file to edit, relative to the workspace root.',
					},
					newText: {
						type: 'string',
						description: 'The replacement text. May be empty to remove oldText.',
					},
					oldText: {
						type: 'string',
						description:
							'The exact text to replace. The edit will only be applied if this text appears exactly once.',
					},
				},
			},
		};
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const input = parseEditFileInput(toolInput);

		return {
			toolName: EDIT_FILE_TOOL_NAME,
			output: await this.editWorkspaceFile.execute({
				...input,
				maxFileBytes: this.maxFileBytes,
			}),
		};
	}
}

const parseEditFileInput = (input: unknown): EditFileInput => {
	if (typeof input !== 'object' || input === null) {
		throw new Error('edit_file requires an object input.');
	}

	const { path, oldText, newText } = input as {
		path?: unknown;
		oldText?: unknown;
		newText?: unknown;
	};

	if (typeof path !== 'string' || path.trim().length === 0) {
		throw new Error('edit_file requires a non-empty string path.');
	}

	if (typeof oldText !== 'string' || oldText.length === 0) {
		throw new Error('edit_file requires a non-empty string oldText.');
	}

	if (typeof newText !== 'string') {
		throw new Error('edit_file requires a string newText.');
	}

	return {
		path: path.trim(),
		oldText,
		newText,
	};
};
