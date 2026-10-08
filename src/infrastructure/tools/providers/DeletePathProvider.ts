import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const deletePathTool = (files: WorkspaceFilePort): LocalTool =>
	defineLocalTool({
		name: 'delete_path',
		description:
			'Delete one workspace-relative file or empty directory. Rejects symlinks, protected paths and workspace root. Nonempty directories must be emptied explicitly.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({ path: z.string().trim().min(1) }),
		execute: (input, executionOptions) => files.deletePath(input, executionOptions),
	});
