import { resolve } from 'node:path';

import type {
	ToolExecutionRequest,
	ToolExecutionResult,
	ToolExecutorPort,
} from '@/application/ports/ToolExecutorPort';
import { ListWorkspaceFiles } from '@/application/use-cases/file-operations/ListWorkspaceFiles';
import { ReadWorkspaceFile } from '@/application/use-cases/file-operations/ReadWorkspaceFile';
import { EditWorkspaceFile } from '@/application/use-cases/file-operations/EditWorkspaceFile';
import { SearchWorkspaceFiles } from '@/application/use-cases/file-operations/SearchWorkspaceFiles';
import type { ToolDefinition } from '@/domain/Tool';
import { NodeWorkspaceFileSystem } from '@/infrastructure/file-system/NodeWorkspaceFileSystem';
import { RipgrepSearch } from '@/infrastructure/tools/ripgrep/RipgrepSearch';
import {
	EDIT_FILE_TOOL_NAME,
	EditFileProvider,
} from './providers/EditFileProvider';
import {
	LIST_FILES_TOOL_NAME,
	ListFilesProvider,
} from './providers/ListFilesProvider';
import {
	READ_FILE_TOOL_NAME,
	ReadFileProvider,
} from './providers/ReadFileProvider';
import {
	SEARCH_FILE_TOOL_NAME,
	SearchFileProvider,
} from './providers/SearchFileProvider';

const DEFAULT_MAX_FILE_BYTES = 200_000;
const DEFAULT_MAX_LIST_FILES = 500;

type LocalToolExecutorOptions = {
	workspaceRoot?: string;
	maxFileBytes?: number;
	maxListFiles?: number;
	maxSearchMatches?: number;
	maxMatchTextLength?: number;
	searchTimeoutMs?: number;
};

export class LocalToolExecutor implements ToolExecutorPort {
	private readonly workspaceRoot: string;
	private readonly maxFileBytes: number;
	private readonly listFilesProvider: ListFilesProvider;
	private readonly readFileProvider: ReadFileProvider;
	private readonly editFileProvider: EditFileProvider;
	private readonly searchFileProvider: SearchFileProvider;

	constructor(options: LocalToolExecutorOptions = {}) {
		const workspaceRoot = options.workspaceRoot ?? process.cwd();

		this.workspaceRoot = resolve(workspaceRoot);
		this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
		const maxListFiles = options.maxListFiles ?? DEFAULT_MAX_LIST_FILES;
		const workspaceFiles = new NodeWorkspaceFileSystem(this.workspaceRoot);

		this.listFilesProvider = new ListFilesProvider(
			new ListWorkspaceFiles(workspaceFiles),
			{
				maxEntries: maxListFiles,
			}
		);

		this.readFileProvider = new ReadFileProvider(
			new ReadWorkspaceFile(workspaceFiles),
			{
				maxFileBytes: this.maxFileBytes,
			}
		);

		this.editFileProvider = new EditFileProvider(
			new EditWorkspaceFile(workspaceFiles),
			{ maxFileBytes: this.maxFileBytes },
		);

		const searchOptions = {
			workspaceRoot: this.workspaceRoot,
			maxMatches: options.maxSearchMatches ?? 50,
			maxMatchTextLength: options.maxMatchTextLength ?? 300,
			timeoutMs: options.searchTimeoutMs ?? 5_000,
		};

		if (
			[
				searchOptions.maxMatches,
				searchOptions.maxMatchTextLength,
				searchOptions.timeoutMs,
			].some((value) => !Number.isFinite(value) || value <= 0)
		) {
			throw new Error('Search limits must be positive numbers.');
		}

		this.searchFileProvider = new SearchFileProvider(
			new SearchWorkspaceFiles(new RipgrepSearch(searchOptions)),
		);
	}

	listTools(): ToolDefinition[] {
		return [
			this.listFilesProvider.getToolDefinition(),
			this.readFileProvider.getToolDefinition(),
			this.searchFileProvider.getToolDefinition(),
			this.editFileProvider.getToolDefinition(),
		];
	}

	async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
		switch (request.toolName) {
			case LIST_FILES_TOOL_NAME:
				return this.listFilesProvider.execute(request.toolInput);
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
