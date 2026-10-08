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
			'Inspect file and directory entries, including empty directories. Default path is root; depth selects a bounded tree.',
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
