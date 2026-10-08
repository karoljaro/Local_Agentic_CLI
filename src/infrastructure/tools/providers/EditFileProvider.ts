import type { EditWorkspaceFile } from '@/application/use-cases/file-operations/EditWorkspaceFile';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

const EDIT_FILE_TOOL_NAME = 'edit_file';

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
			'Edit a workspace-relative file after reading it. Each oldText must occur once in the original; edits cannot overlap. All edits commit together.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({
			path: z.string().trim().min(1),
			edits: z
				.array(
					z.strictObject({
						oldText: z.string().min(1),
						newText: z.string().describe('Literal replacement; empty deletes the matched text.'),
					}),
				)
				.min(1)
				.max(50),
		}),
		execute: async (input, executionOptions) =>
			editWorkspaceFile.execute(
				{
					...input,
					maxFileBytes: options.maxFileBytes,
				},
				executionOptions,
			),
	});
};
