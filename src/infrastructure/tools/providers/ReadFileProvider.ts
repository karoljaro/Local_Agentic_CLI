import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { ReadWorkspaceFile } from '@/application/use-cases/file-operations/ReadWorkspaceFile';
import type { ToolDefinition } from '@/domain/Tool';

export const READ_FILE_TOOL_NAME = 'read_file';

type ReadFileProviderOptions = {
	maxFileBytes: number;
	maxLines: number;
	maxCharacters: number;
};

type ReadFileInput = {
	path: string;
	startLine?: number;
	endLine?: number;
};

export class ReadFileProvider {
	constructor(
		private readonly readWorkspaceFile: ReadWorkspaceFile,
		private readonly options: ReadFileProviderOptions,
	) {
		if (
			!Number.isInteger(options.maxLines) ||
			options.maxLines <= 0 ||
			!Number.isInteger(options.maxCharacters) ||
			options.maxCharacters <= 0
		) {
			throw new Error('Read file output limits must be positive integers.');
		}
	}

	getToolDefinition(): ToolDefinition {
		return {
			name: READ_FILE_TOOL_NAME,
			description:
				'Read a bounded line range from a UTF-8 text file in the current workspace. Use startLine and endLine to continue reading truncated files.',
			parameters: {
				type: 'object',
				required: ['path'],
				additionalProperties: false,
				properties: {
					path: {
						type: 'string',
						description: 'Relative path to a file in the current workspace.',
					},
					startLine: {
						type: 'integer',
						minimum: 1,
						description: 'Optional one-based first line. Defaults to 1.',
					},
					endLine: {
						type: 'integer',
						minimum: 1,
						description: 'Optional one-based last line, inclusive.',
					},
				},
			},
		};
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const input = parseReadFileInput(toolInput);

		const file = await this.readWorkspaceFile.execute({
			path: input.path,
			maxFileBytes: this.options.maxFileBytes,
		});

		return {
			toolName: READ_FILE_TOOL_NAME,
			output: sliceFile(file, input, this.options),
		};
	}
}

const parseReadFileInput = (toolInput: unknown): ReadFileInput => {
	if (
		typeof toolInput !== 'object' ||
		toolInput === null ||
		!('path' in toolInput) ||
		typeof toolInput.path !== 'string' ||
		toolInput.path.trim().length === 0
	) {
		throw new Error('read_file requires a non-empty string path.');
	}

	const inputRecord = toolInput as Record<string, unknown>;
	const startLine = readOptionalPositiveInteger(inputRecord, 'startLine');
	const endLine = readOptionalPositiveInteger(inputRecord, 'endLine');

	if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
		throw new Error('read_file endLine must be greater than or equal to startLine.');
	}

	return {
		path: toolInput.path.trim(),
		...(startLine === undefined ? {} : { startLine }),
		...(endLine === undefined ? {} : { endLine }),
	};
};

const readOptionalPositiveInteger = (
	input: Record<string, unknown>,
	propertyName: 'startLine' | 'endLine',
): number | undefined => {
	if (!(propertyName in input) || input[propertyName] === undefined) {
		return undefined;
	}

	const value = input[propertyName];

	if (!Number.isInteger(value) || (value as number) <= 0) {
		throw new Error(`read_file ${propertyName} must be a positive integer.`);
	}

	return value as number;
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
