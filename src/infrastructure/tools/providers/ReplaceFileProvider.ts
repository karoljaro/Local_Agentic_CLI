import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { throwIfAborted } from '@/application/services/cancellation';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';
import { contentVersion } from '../contentVersion';

export const replaceFileTool = (
	files: WorkspaceFilePort,
	options: { maxFileBytes: number },
): LocalTool =>
	defineLocalTool({
		name: 'replace_file',
		description:
			'Replace the entire existing UTF-8 file; rejects stale versions. Prefer edit_file when bounded exact edits suffice.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema: z.strictObject({
			path: z.string().trim().min(1),
			content: z.string(),
			expectedVersion: z
				.string()
				.regex(/^[a-f0-9]{64}$/)
				.describe(
					'Use exactly the current version from read_file for this file. Never invent or reconstruct it. If unavailable or stale, read_file again.',
				),
		}),
		execute: async (input, executionOptions) => {
			const file = await files.readFile(
				{ path: input.path, maxFileBytes: options.maxFileBytes },
				executionOptions,
			);
			throwIfAborted(executionOptions.signal);
			if (contentVersion(file.content) !== input.expectedVersion) {
				throw new Error(
					`File changed since it was read: ${input.path}. Read it again before replacing.`,
				);
			}
			if (file.content === input.content) return { path: file.path, changed: false };
			const written = await files.writeFile(
				{
					path: file.path,
					content: input.content,
					expectedContent: file.content,
					maxFileBytes: options.maxFileBytes,
				},
				executionOptions,
			);
			return { path: written.path, changed: true };
		},
	});
