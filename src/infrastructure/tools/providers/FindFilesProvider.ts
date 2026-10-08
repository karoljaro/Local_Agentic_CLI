import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const findFilesTool = (
	files: WorkspaceFilePort,
	options: { maxEntries: number },
): LocalTool =>
	defineLocalTool({
		name: 'find_files',
		description:
			'Find file paths recursively by glob, without searching contents. path scopes the search; default root.',
		deduplicate: true,
		inputSchema: z.strictObject({
			pattern: z
				.string()
				.min(1)
				.max(200)
				.describe(
					'Only *, **, ? wildcards. Without / matches basenames; with / matches paths relative to path.',
				),
			path: z.string().trim().min(1).optional(),
		}),
		execute: (input, executionOptions) =>
			files.findFiles(
				{
					pattern: input.pattern,
					...(input.path === undefined ? {} : { path: input.path }),
					maxEntries: options.maxEntries,
				},
				executionOptions,
			),
	});
