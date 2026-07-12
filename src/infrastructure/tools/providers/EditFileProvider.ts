import type { EditWorkspaceFile } from '@/application/use-cases/file-operations/EditWorkspaceFile';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const EDIT_FILE_TOOL_NAME = 'edit_file';

type EditFileProviderOptions = {
	maxFileBytes: number;
};

export const editFileTool = (
	editWorkspaceFile: EditWorkspaceFile,
	options: EditFileProviderOptions,
): LocalTool => {
	if (options.maxFileBytes <= 0) {
		throw new Error('Max file size must be greater than zero.');
	}

	return defineLocalTool({
		name: EDIT_FILE_TOOL_NAME,
		description:
			'Replace exact text in a UTF-8 file in the current workspace. Use this after reading the target file.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({
			path: z
				.string()
				.trim()
				.min(1)
				.describe('The path to the file to edit, relative to the workspace root.'),
			oldText: z
				.string()
				.min(1)
				.describe(
					'The exact text to replace. The edit will only be applied if this text appears exactly once.',
				),
			newText: z.string().describe('The replacement text. May be empty to remove oldText.'),
		}),
		execute: async (input) =>
			editWorkspaceFile.execute({
				...input,
				maxFileBytes: options.maxFileBytes,
			}),
	});
};
