import type { WorkspaceSearchPort } from '@/application/ports/WorkspaceSearchPort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const searchTextTool = (search: WorkspaceSearchPort): LocalTool =>
	defineLocalTool({
		name: 'search_text',
		description:
			'Find literal text in files; returns bounded path/line/excerpt matches. If truncated, narrow the query.',
		deduplicate: true,
		inputSchema: z.strictObject({
			query: z
				.string()
				.min(1)
				.max(20_000)
				.regex(/^[^\r\n\0]+$/, 'Query must be single-line text without null characters.')
				.describe('Literal single-line text; preserves whitespace and |.'),
		}),
		execute: (input, executionOptions) => search.search(input, executionOptions),
	});
