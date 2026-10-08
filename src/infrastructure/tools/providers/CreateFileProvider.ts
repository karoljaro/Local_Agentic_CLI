import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

const CREATE_FILE_TOOL_NAME = 'create_file';

type CreateFileProviderOptions = {
	maxFileBytes: number;
};

export const createFileTool = (
	workspaceFiles: WorkspaceFilePort,
	options: CreateFileProviderOptions,
): LocalTool =>
	defineLocalTool({
		name: CREATE_FILE_TOOL_NAME,
		description:
			'Create a new UTF-8 file and missing parent directories. Never overwrites. Path is workspace-relative.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({
			path: z.string().trim().min(1),
			content: z.string(),
		}),
		execute: async (input, executionOptions) => {
			const file = await workspaceFiles.createFile(
				{
					...input,
					maxFileBytes: options.maxFileBytes,
				},
				executionOptions,
			);

			return {
				path: file.path,
				created: true,
				...(file.warnings === undefined ? {} : { warnings: file.warnings }),
			};
		},
	});
