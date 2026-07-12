import { resolve } from 'node:path';

import { CreateWorkspaceFile } from '@/application/use-cases/file-operations/CreateWorkspaceFile';
import { EditWorkspaceFile } from '@/application/use-cases/file-operations/EditWorkspaceFile';
import { ListWorkspaceFiles } from '@/application/use-cases/file-operations/ListWorkspaceFiles';
import { ReadWorkspaceFile } from '@/application/use-cases/file-operations/ReadWorkspaceFile';
import { SearchWorkspaceFiles } from '@/application/use-cases/file-operations/SearchWorkspaceFiles';
import { NodeWorkspaceFileSystem } from '@/infrastructure/file-system/NodeWorkspaceFileSystem';
import { LocalToolRegistry } from '@/infrastructure/tools/LocalToolExecutor';
import { createFileTool } from '@/infrastructure/tools/providers/CreateFileProvider';
import { editFileTool } from '@/infrastructure/tools/providers/EditFileProvider';
import { listFilesTool } from '@/infrastructure/tools/providers/ListFilesProvider';
import { readFileTool } from '@/infrastructure/tools/providers/ReadFileProvider';
import { searchFileTool } from '@/infrastructure/tools/providers/SearchFileProvider';
import { RipgrepSearch } from '@/infrastructure/tools/ripgrep/RipgrepSearch';

const DEFAULT_MAX_FILE_BYTES = 200_000;
const DEFAULT_MAX_LIST_FILES = 500;
const DEFAULT_MAX_READ_LINES = 400;
const DEFAULT_MAX_READ_CHARACTERS = 20_000;

type LocalToolExecutorOptions = {
	workspaceRoot?: string;
	maxFileBytes?: number;
	maxListFiles?: number;
	maxReadLines?: number;
	maxReadCharacters?: number;
	maxSearchMatches?: number;
	maxMatchTextLength?: number;
	searchTimeoutMs?: number;
};

export const createLocalToolExecutor = (
	options: LocalToolExecutorOptions = {},
): LocalToolRegistry => {
	const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
	const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
	const workspaceFiles = new NodeWorkspaceFileSystem(workspaceRoot);
	const searchOptions = {
		workspaceRoot,
		maxMatches: options.maxSearchMatches ?? 50,
		maxMatchTextLength: options.maxMatchTextLength ?? 300,
		timeoutMs: options.searchTimeoutMs ?? 5_000,
	};

	if (
		[searchOptions.maxMatches, searchOptions.maxMatchTextLength, searchOptions.timeoutMs].some(
			(value) => !Number.isFinite(value) || value <= 0,
		)
	) {
		throw new Error('Search limits must be positive numbers.');
	}

	return new LocalToolRegistry([
		listFilesTool(new ListWorkspaceFiles(workspaceFiles), {
			maxEntries: options.maxListFiles ?? DEFAULT_MAX_LIST_FILES,
		}),
		readFileTool(new ReadWorkspaceFile(workspaceFiles), {
			maxFileBytes,
			maxLines: options.maxReadLines ?? DEFAULT_MAX_READ_LINES,
			maxCharacters: options.maxReadCharacters ?? DEFAULT_MAX_READ_CHARACTERS,
		}),
		searchFileTool(new SearchWorkspaceFiles(new RipgrepSearch(searchOptions))),
		createFileTool(new CreateWorkspaceFile(workspaceFiles), {
			maxFileBytes,
		}),
		editFileTool(new EditWorkspaceFile(workspaceFiles), { maxFileBytes }),
	]);
};
