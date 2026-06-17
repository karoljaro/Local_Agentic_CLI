import { resolve } from 'node:path';

import type {
	ToolExecutionRequest,
	ToolExecutionResult,
	ToolExecutorPort,
} from '@/application/ports/ToolExecutorPort';
import { ReadWorkspaceFile } from '@/application/use-cases/file-operations/ReadWorkspaceFile';
import type { ToolDefinition } from '@/domain/Tool';
import { NodeWorkspaceFileSystem } from '@/infrastructure/file-system/NodeWorkspaceFileSystem';
import {
	EDIT_FILE_TOOL_NAME,
	EditFileProvider,
} from './providers/EditFileProvider';
import {
	READ_FILE_TOOL_NAME,
	ReadFileProvider,
} from './providers/ReadFileProvider';
import {
	SEARCH_FILE_TOOL_NAME,
	SearchFileProvider,
	type SearchFileProviderOptions,
} from './providers/SearchFileProvider';

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
	private readonly readFileProvider: ReadFileProvider;
	private readonly editFileProvider: EditFileProvider;
	private readonly searchFileProvider: SearchFileProvider;

	constructor(options: LocalToolExecutorOptions = {}) {
		const workspaceRoot = options.workspaceRoot ?? process.cwd();

		this.workspaceRoot = resolve(workspaceRoot);
		this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
		this.readFileProvider = new ReadFileProvider(
			new ReadWorkspaceFile(new NodeWorkspaceFileSystem(this.workspaceRoot)),
			{
				maxFileBytes: this.maxFileBytes,
			},
		);
		this.editFileProvider = new EditFileProvider({
			workspaceRoot: this.workspaceRoot,
			maxFileBytes: this.maxFileBytes,
		});
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
	}

	listTools(): ToolDefinition[] {
		return [
			this.readFileProvider.getToolDefinition(),
			this.searchFileProvider.getToolDefinition(),
			this.editFileProvider.getToolDefinition(),
		];
	}

	async execute(
		request: ToolExecutionRequest,
	): Promise<ToolExecutionResult> {
		switch (request.toolName) {
			case READ_FILE_TOOL_NAME:
				return this.readFileProvider.execute(request.toolInput);
			case SEARCH_FILE_TOOL_NAME:
				return this.searchFileProvider.execute(request.toolInput);
			case EDIT_FILE_TOOL_NAME:
				return this.editFileProvider.execute(request.toolInput);
			default:
				throw new Error(`Unknown tool: ${request.toolName}`);
		}
	}
}
