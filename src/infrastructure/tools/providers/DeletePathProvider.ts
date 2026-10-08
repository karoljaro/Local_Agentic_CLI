import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const deletePathTool = (files: WorkspaceFilePort): LocalTool =>
	defineLocalTool({
		name: 'delete_path',
		description:
			'Delete one file or empty directory, never recursively. Rejects symlinks, protected paths and workspace root.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({ path: z.string().trim().min(1) }),
		execute: (input, executionOptions) => files.deletePath(input, executionOptions),
	});
