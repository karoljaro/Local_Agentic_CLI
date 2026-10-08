import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const listDirectoryTool = (
	files: WorkspaceFilePort,
	options: { maxEntries: number },
): LocalTool =>
	defineLocalTool({
		name: 'list_directory',
		description:
			'Inspect directory entries, including empty directories. Paths are workspace-relative; defaults to root and one level. Use depth for a bounded tree, find_files for filename patterns.',
		deduplicate: true,
		inputSchema: z.strictObject({
			path: z.string().trim().min(1).optional(),
			depth: z.int().min(1).max(5).optional().describe('Levels to list; default 1.'),
		}),
		execute: (input, executionOptions) =>
			files.listDirectory(
				{
					...(input.path === undefined ? {} : { path: input.path }),
					depth: input.depth ?? 1,
					maxEntries: options.maxEntries,
				},
				executionOptions,
			),
	});
