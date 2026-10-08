import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const moveFileTool = (files: WorkspaceFilePort): LocalTool =>
	defineLocalTool({
		name: 'move_file',
		description:
			'Move or rename one regular file; creates missing destination parents and fails if destination exists. Rejects symlinks and directories.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({
			source: z.string().trim().min(1),
			destination: z.string().trim().min(1),
		}),
		execute: (input, executionOptions) => files.moveFile(input, executionOptions),
	});
