import type { ReadWorkspaceFile } from '@/application/use-cases/file-operations/ReadWorkspaceFile';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const READ_FILE_TOOL_NAME = 'read_file';

type ReadFileProviderOptions = {
	maxFileBytes: number;
	maxLines: number;
	maxCharacters: number;
};

const readFileInputSchema = z
	.strictObject({
		path: z.string().trim().min(1).describe('Relative path to a file in the current workspace.'),
		startLine: z.int().min(1).optional().describe('Optional one-based first line. Defaults to 1.'),
		endLine: z.int().min(1).optional().describe('Optional one-based last line, inclusive.'),
	})
	.refine(
		(input) =>
			input.startLine === undefined ||
			input.endLine === undefined ||
			input.endLine >= input.startLine,
		{
			message: 'endLine must be greater than or equal to startLine',
			path: ['endLine'],
		},
	);

type ReadFileInput = z.output<typeof readFileInputSchema>;

export const readFileTool = (
	readWorkspaceFile: ReadWorkspaceFile,
	options: ReadFileProviderOptions,
): LocalTool => {
	if (
		!Number.isInteger(options.maxLines) ||
		options.maxLines <= 0 ||
		!Number.isInteger(options.maxCharacters) ||
		options.maxCharacters <= 0
	) {
		throw new Error('Read file output limits must be positive integers.');
	}

	return defineLocalTool({
		name: READ_FILE_TOOL_NAME,
		description:
			'Read a bounded line range from a UTF-8 text file in the current workspace. Use startLine and endLine to continue reading truncated files.',
		inputSchema: readFileInputSchema,
		execute: async (input) => {
			const file = await readWorkspaceFile.execute({
				path: input.path,
				maxFileBytes: options.maxFileBytes,
			});

			return sliceFile(file, input, options);
		},
	});
};

const sliceFile = (
	file: { path: string; content: string },
	input: ReadFileInput,
	options: ReadFileProviderOptions,
): Record<string, unknown> => {
	const lines = file.content.length === 0 ? [] : file.content.split('\n');
	const totalLines = lines.length;
	const startLine = input.startLine ?? 1;

	if (totalLines === 0) {
		if (startLine !== 1) {
			throw new Error(`read_file startLine exceeds the file length: ${startLine}.`);
		}

		return {
			path: file.path,
			content: '',
			startLine: 1,
			endLine: 0,
			totalLines: 0,
			truncated: false,
		};
	}

	if (startLine > totalLines) {
		throw new Error(`read_file startLine exceeds the file length: ${startLine}.`);
	}

	const requestedEndLine = input.endLine ?? totalLines;
	const boundedEndLine = Math.min(requestedEndLine, totalLines, startLine + options.maxLines - 1);
	const selectedContent = lines.slice(startLine - 1, boundedEndLine).join('\n');
	const content = selectedContent.slice(0, options.maxCharacters);
	const endLine = Math.min(boundedEndLine, startLine + (content.match(/\n/g)?.length ?? 0));

	return {
		path: file.path,
		content,
		startLine,
		endLine,
		totalLines,
		truncated:
			startLine > 1 || endLine < totalLines || selectedContent.length > options.maxCharacters,
	};
};
