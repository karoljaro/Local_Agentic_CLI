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
			'Apply local exact edits after reading the file. Each oldText must match once in the original; no overlaps. All edits commit together.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({
			path: z.string().trim().min(1),
			edits: z
				.array(
					z.strictObject({
						oldText: z.string().min(1),
						newText: z.string().describe('Literal text; empty deletes the match.'),
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
