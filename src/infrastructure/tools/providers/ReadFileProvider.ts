import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export const READ_FILE_TOOL_NAME = 'read_file';

export type ReadFileProviderOptions = {
	workspaceRoot: string;
	maxFileBytes: number;
};

type ReadFileInput = {
	path: string;
};

export class ReadFileProvider {
	private readonly workspaceRoot: string;
	private readonly maxFileBytes: number;

	constructor(options: ReadFileProviderOptions) {
		this.workspaceRoot = resolve(options.workspaceRoot);
		this.maxFileBytes = options.maxFileBytes;

		if (this.maxFileBytes <= 0) {
			throw new Error('Max file size must be greater than zero.');
		}
	}

	getToolDefinition(): ToolDefinition {
		return {
			name: READ_FILE_TOOL_NAME,
			description:
				'Read a UTF-8 text file from the current workspace. Use relative paths.',
			parameters: {
				type: 'object',
				required: ['path'],
				additionalProperties: false,
				properties: {
					path: {
						type: 'string',
						description: 'Relative path to a file in the current workspace.',
					},
				},
			},
		};
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const input = parseReadFileInput(toolInput);

		if (isAbsolute(input.path)) {
			throw new Error('read_file requires a relative path.');
		}

		const targetPath = resolve(this.workspaceRoot, input.path);

		if (!isPathInside(this.workspaceRoot, targetPath)) {
			throw new Error(`Cannot read file outside workspace: ${input.path}`);
		}

		const realWorkspaceRoot = await realpath(this.workspaceRoot);
		const realTargetPath = await realpath(targetPath);

		if (!isPathInside(realWorkspaceRoot, realTargetPath)) {
			throw new Error(`Cannot read file outside workspace: ${input.path}`);
		}

		const fileStats = await stat(realTargetPath);

		if (!fileStats.isFile()) {
			throw new Error(`Path is not a file: ${input.path}`);
		}

		if (fileStats.size > this.maxFileBytes) {
			throw new Error(
				`File is too large: ${input.path} (${fileStats.size} bytes, max ${this.maxFileBytes})`,
			);
		}

		const content = await readFile(realTargetPath, 'utf8');

		return {
			toolName: READ_FILE_TOOL_NAME,
			output: {
				path: relative(realWorkspaceRoot, realTargetPath),
				content,
			},
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

	return {
		path: toolInput.path.trim(),
	};
};

const isPathInside = (parentPath: string, childPath: string): boolean => {
	const relativePath = relative(parentPath, childPath);

	return (
		relativePath.length === 0 ||
		(!relativePath.startsWith('..') && !isAbsolute(relativePath))
	);
};
