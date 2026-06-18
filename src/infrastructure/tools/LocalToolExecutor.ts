import type {
	ToolExecutionRequest,
	ToolExecutionResult,
	ToolExecutorPort,
} from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';
import {
	CREATE_FILE_TOOL_NAME,
	type CreateFileProvider,
} from './providers/CreateFileProvider';
import {
	EDIT_FILE_TOOL_NAME,
	type EditFileProvider,
} from './providers/EditFileProvider';
import {
	LIST_FILES_TOOL_NAME,
	type ListFilesProvider,
} from './providers/ListFilesProvider';
import {
	READ_FILE_TOOL_NAME,
	type ReadFileProvider,
} from './providers/ReadFileProvider';
import {
	SEARCH_FILE_TOOL_NAME,
	type SearchFileProvider,
} from './providers/SearchFileProvider';

export type LocalToolExecutorDependencies = {
	listFilesProvider: ListFilesProvider;
	readFileProvider: ReadFileProvider;
	searchFileProvider: SearchFileProvider;
	createFileProvider: CreateFileProvider;
	editFileProvider: EditFileProvider;
};

export class LocalToolExecutor implements ToolExecutorPort {
	constructor(private readonly dependencies: LocalToolExecutorDependencies) {}

	listTools(): ToolDefinition[] {
		return [
			this.dependencies.listFilesProvider.getToolDefinition(),
			this.dependencies.readFileProvider.getToolDefinition(),
			this.dependencies.searchFileProvider.getToolDefinition(),
			this.dependencies.createFileProvider.getToolDefinition(),
			this.dependencies.editFileProvider.getToolDefinition(),
		];
	}

	async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
		switch (request.toolName) {
			case LIST_FILES_TOOL_NAME:
				return this.dependencies.listFilesProvider.execute(
					request.toolInput
				);
			case READ_FILE_TOOL_NAME:
				return this.dependencies.readFileProvider.execute(
					request.toolInput
				);
			case SEARCH_FILE_TOOL_NAME:
				return this.dependencies.searchFileProvider.execute(
					request.toolInput
				);
			case CREATE_FILE_TOOL_NAME:
				return this.dependencies.createFileProvider.execute(
					request.toolInput
				);
			case EDIT_FILE_TOOL_NAME:
				return this.dependencies.editFileProvider.execute(
					request.toolInput
				);
			default:
				throw new Error(`Unknown tool: ${request.toolName}`);
		}
	}
}
