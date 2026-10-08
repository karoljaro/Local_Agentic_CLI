import { resolve } from 'node:path';

import { EditWorkspaceFile } from '@/application/use-cases/file-operations/EditWorkspaceFile';
import { NodeWorkspaceFileSystem } from '@/infrastructure/file-system/NodeWorkspaceFileSystem';
import { LocalToolRegistry } from '@/infrastructure/tools/LocalToolExecutor';
import { createFileTool } from '@/infrastructure/tools/providers/CreateFileProvider';
import { editFileTool } from '@/infrastructure/tools/providers/EditFileProvider';
import { listDirectoryTool } from '@/infrastructure/tools/providers/ListDirectoryProvider';
import { findFilesTool } from '@/infrastructure/tools/providers/FindFilesProvider';
import { readFileTool } from '@/infrastructure/tools/providers/ReadFileProvider';
import { searchTextTool } from '@/infrastructure/tools/providers/SearchTextProvider';
import { replaceFileTool } from '@/infrastructure/tools/providers/ReplaceFileProvider';
import { moveFileTool } from '@/infrastructure/tools/providers/MoveFileProvider';
import { deletePathTool } from '@/infrastructure/tools/providers/DeletePathProvider';
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
	const maxEntries = options.maxListFiles ?? DEFAULT_MAX_LIST_FILES;
	const maxLines = options.maxReadLines ?? DEFAULT_MAX_READ_LINES;
	const maxCharacters = options.maxReadCharacters ?? DEFAULT_MAX_READ_CHARACTERS;
	const workspaceFiles = new NodeWorkspaceFileSystem(workspaceRoot);
	const searchOptions = {
		workspaceRoot,
		maxMatches: options.maxSearchMatches ?? 50,
		maxMatchTextLength: options.maxMatchTextLength ?? 300,
		timeoutMs: options.searchTimeoutMs ?? 5_000,
	};

	if (
		[
			maxFileBytes,
			maxEntries,
			maxLines,
			maxCharacters,
			searchOptions.maxMatches,
			searchOptions.maxMatchTextLength,
			searchOptions.timeoutMs,
		].some((value) => !Number.isSafeInteger(value) || value <= 0)
	) {
		throw new Error('Workspace tool limits must be positive safe integers.');
	}

	return new LocalToolRegistry([
		listDirectoryTool(workspaceFiles, { maxEntries }),
		findFilesTool(workspaceFiles, { maxEntries }),
		readFileTool(workspaceFiles, {
			maxFileBytes,
			maxLines,
			maxCharacters,
		}),
		searchTextTool(new RipgrepSearch(searchOptions)),
		createFileTool(workspaceFiles, {
			maxFileBytes,
		}),
		editFileTool(new EditWorkspaceFile(workspaceFiles), { maxFileBytes }),
		replaceFileTool(workspaceFiles, { maxFileBytes }),
		moveFileTool(workspaceFiles),
		deletePathTool(workspaceFiles),
	]);
};
