import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const LIST_FILES_TOOL_NAME = 'list_files';

type ListFilesProviderOptions = {
	maxEntries: number;
};

export const listFilesTool = (
	workspaceFiles: WorkspaceFilePort,
	options: ListFilesProviderOptions,
): LocalTool => {
	if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) {
		throw new Error('Max list entries must be a positive integer.');
	}

	return defineLocalTool({
		name: LIST_FILES_TOOL_NAME,
		description:
			'Recursively list file paths in the workspace or under an optional relative path. Use this to discover project structure or locate files by name or extension. Do not use it to search file contents; use search_file instead.',
		deduplicate: true,
		inputSchema: z.strictObject({
			path: z
				.string()
				.trim()
				.min(1)
				.optional()
				.describe('Optional relative file or directory path. Defaults to the workspace root.'),
		}),
		execute: async (input) => {
			const path = input.path;

			return workspaceFiles.listFiles({
				...(path === undefined ? {} : { path }),
				maxEntries: options.maxEntries,
			});
		},
	});
};
