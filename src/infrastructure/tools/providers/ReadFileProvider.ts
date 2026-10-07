import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

const READ_FILE_TOOL_NAME = 'read_file';

type ReadFileProviderOptions = {
	maxFileBytes: number;
	maxLines: number;
	maxCharacters: number;
};

const readFileInputSchema = z
	.strictObject({
		path: z.string().trim().min(1).describe('Relative path to a file in the current workspace.'),
		startLine: z
			.int()
			.min(1)
			.optional()
			.describe('Optional one-based first line. Defaults to 1 when startOffset is absent.'),
		startOffset: z
			.int()
			.min(0)
			.optional()
			.describe(
				'Optional zero-based UTF-16 offset into the decoded file. Cannot accompany startLine. Pass nextRead unchanged for continuation.',
			),
		endLine: z
			.int()
			.min(1)
			.optional()
			.describe('Optional one-based last line, inclusive; excludes its following newline.'),
	})
	.refine((input) => input.startOffset === undefined || input.startLine === undefined, {
		message: 'startOffset and startLine must not be supplied together',
		path: ['startOffset'],
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
	workspaceFiles: WorkspaceFilePort,
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
			'Read a bounded range from a UTF-8 text file in the current workspace. Use startLine/endLine to select lines or startOffset as a zero-based UTF-16 cursor. When nextRead is returned, pass it unchanged to continue from the first unreturned character. Output startLine/endLine describe touched lines, which may be partial. truncated describes a partial-file view; only nextRead indicates forward content remains.',
		inputSchema: readFileInputSchema,
		execute: async (input, executionOptions) => {
			const file = await workspaceFiles.readFile(
				{
					path: input.path,
					maxFileBytes: options.maxFileBytes,
				},
				executionOptions,
			);

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
	// Joining preserves the existing inclusive endLine contract, including CR before LF.
	const rangeEndOffset = lines.slice(0, input.endLine ?? totalLines).join('\n').length;

	if (input.startOffset !== undefined && input.startOffset > rangeEndOffset) {
		throw new Error(`read_file startOffset exceeds the requested range: ${input.startOffset}.`);
	}

	const startLine =
		input.startOffset === undefined
			? (input.startLine ?? 1)
			: file.content.slice(0, input.startOffset).split('\n').length;

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
	const startOffset =
		input.startOffset ??
		lines.slice(0, startLine - 1).reduce((offset, line) => offset + line.length + 1, 0);
	let selectedContent: string;

	if (input.startOffset === undefined) {
		// Preserve first-page content for existing line-only callers.
		selectedContent = lines.slice(startLine - 1, boundedEndLine).join('\n');
	} else {
		const characterEndOffset = Math.min(rangeEndOffset, startOffset + options.maxCharacters);
		let pageEndOffset = startOffset;

		for (
			let segment = 0;
			segment < options.maxLines && pageEndOffset < characterEndOffset;
			segment += 1
		) {
			const newlineOffset = file.content.indexOf('\n', pageEndOffset);
			pageEndOffset =
				newlineOffset === -1 ? characterEndOffset : Math.min(newlineOffset + 1, characterEndOffset);
		}

		selectedContent = file.content.slice(startOffset, pageEndOffset);
	}

	const content = selectedContent.slice(0, options.maxCharacters);
	const returnedNewlines = content.match(/\n/g)?.length ?? 0;
	const endLine = Math.min(
		boundedEndLine,
		startLine +
			returnedNewlines -
			(input.startOffset !== undefined && content.endsWith('\n') ? 1 : 0),
	);
	const nextOffset = startOffset + content.length;

	return {
		path: file.path,
		content,
		startLine,
		endLine,
		totalLines,
		truncated:
			input.startOffset === undefined
				? startLine > 1 || endLine < totalLines || selectedContent.length > options.maxCharacters
				: startOffset > 0 || nextOffset < file.content.length,
		...(nextOffset < rangeEndOffset
			? {
					nextRead: {
						path: file.path,
						startOffset: nextOffset,
						...(input.endLine === undefined ? {} : { endLine: input.endLine }),
					},
				}
			: {}),
	};
};
