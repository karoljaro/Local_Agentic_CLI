import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const moveFileTool = (files: WorkspaceFilePort): LocalTool =>
	defineLocalTool({
		name: 'move_file',
		description:
			'Move or rename one workspace-relative regular file. Creates missing destination parents; fails if destination exists. Symlinks and directories are rejected.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({
			source: z.string().trim().min(1),
			destination: z.string().trim().min(1),
		}),
		execute: (input, executionOptions) => files.moveFile(input, executionOptions),
	});
