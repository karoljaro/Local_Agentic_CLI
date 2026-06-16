import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import type {
	ToolExecutionRequest,
	ToolExecutionResult,
	ToolExecutorPort,
} from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';
import {
	SEARCH_FILE_TOOL_NAME,
	SearchFileProvider,
	type SearchFileProviderOptions,
} from './providers/SearchFileProvider';

const READ_FILE_TOOL_NAME = 'read_file';
const DEFAULT_MAX_FILE_BYTES = 200_000;

type LocalToolExecutorOptions = Omit<
	SearchFileProviderOptions,
	'workspaceRoot'
> & {
	workspaceRoot?: string;
	maxFileBytes?: number;
};

export class LocalToolExecutor implements ToolExecutorPort {
	private readonly workspaceRoot: string;
	private readonly maxFileBytes: number;
	private readonly searchFileProvider: SearchFileProvider;

	constructor(options: LocalToolExecutorOptions = {}) {
		const workspaceRoot = options.workspaceRoot ?? process.cwd();

		this.workspaceRoot = resolve(workspaceRoot);
		this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
		this.searchFileProvider = new SearchFileProvider({
			workspaceRoot: this.workspaceRoot,
			...(options.maxSearchMatches === undefined
				? {}
				: { maxSearchMatches: options.maxSearchMatches }),
			...(options.maxMatchTextLength === undefined
				? {}
				: { maxMatchTextLength: options.maxMatchTextLength }),
			...(options.searchTimeoutMs === undefined
				? {}
				: { searchTimeoutMs: options.searchTimeoutMs }),
		});

		if (this.maxFileBytes <= 0) {
			throw new Error('Max file size must be greater than zero.');
		}
	}

	listTools(): ToolDefinition[] {
		return [
			{
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
			},
			this.searchFileProvider.getToolDefinition(),
		];
	}

	async execute(
		request: ToolExecutionRequest,
	): Promise<ToolExecutionResult> {
		switch (request.toolName) {
			case READ_FILE_TOOL_NAME:
				return this.readFile(request.toolInput);
			case SEARCH_FILE_TOOL_NAME:
				return this.searchFileProvider.execute(request.toolInput);
			default:
				throw new Error(`Unknown tool: ${request.toolName}`);
		}
	}

	private async readFile(toolInput: unknown): Promise<ToolExecutionResult> {
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

const parseReadFileInput = (toolInput: unknown): { path: string } => {
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
