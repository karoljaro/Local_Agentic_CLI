import type { CreateWorkspaceFile } from '@/application/use-cases/file-operations/CreateWorkspaceFile';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const CREATE_FILE_TOOL_NAME = 'create_file';

type CreateFileProviderOptions = {
	maxFileBytes: number;
};

export const createFileTool = (
	createWorkspaceFile: CreateWorkspaceFile,
	options: CreateFileProviderOptions,
): LocalTool =>
	defineLocalTool({
		name: CREATE_FILE_TOOL_NAME,
		description:
			'Create a new UTF-8 file in an existing workspace directory. Fails if the file already exists.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({
			path: z
				.string()
				.trim()
				.min(1)
				.describe('The path for the new file, relative to the workspace root.'),
			content: z.string().describe('The complete content of the new file.'),
		}),
		execute: async (input) => {
			const file = await createWorkspaceFile.execute({
				...input,
				maxFileBytes: options.maxFileBytes,
			});

			return {
				path: file.path,
				created: true,
			};
		},
	});
