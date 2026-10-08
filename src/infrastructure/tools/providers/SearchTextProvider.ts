import type { WorkspaceSearchPort } from '@/application/ports/WorkspaceSearchPort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const searchTextTool = (search: WorkspaceSearchPort): LocalTool =>
	defineLocalTool({
		name: 'search_text',
		description:
			'Find literal text inside workspace files. Returns bounded path/line/excerpt matches; truncated means narrow the query. Use find_files for filenames.',
		deduplicate: true,
		inputSchema: z.strictObject({
			query: z
				.string()
				.min(1)
				.max(20_000)
				.regex(/^[^\r\n\0]+$/, 'Query must be single-line text without null characters.')
				.describe('Exact single-line text; whitespace and | are literal, not regex.'),
		}),
		execute: (input, executionOptions) => search.search(input, executionOptions),
	});
