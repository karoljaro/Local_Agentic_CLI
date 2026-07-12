import type { SearchWorkspaceFiles } from '@/application/use-cases/file-operations/SearchWorkspaceFiles';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const SEARCH_FILE_TOOL_NAME = 'search_file';

export const searchFileTool = (searchWorkspaceFiles: SearchWorkspaceFiles): LocalTool =>
	defineLocalTool({
		name: SEARCH_FILE_TOOL_NAME,
		description:
			'Search workspace files for exact text. Use | for alternatives. Returns a bounded list of paths, line numbers, and excerpts; truncated indicates more matches exist.',
		deduplicate: true,
		inputSchema: z.strictObject({
			query: z
				.string()
				.trim()
				.min(1, 'search_file requires a non-empty string query.')
				.describe('Exact text or | separated alternatives.'),
		}),
		execute: async ({ query }) => searchWorkspaceFiles.execute({ query }),
	});
