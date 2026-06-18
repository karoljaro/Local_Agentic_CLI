import { resolve } from 'node:path';

import { CreateWorkspaceFile } from '@/application/use-cases/file-operations/CreateWorkspaceFile';
import { EditWorkspaceFile } from '@/application/use-cases/file-operations/EditWorkspaceFile';
import { ListWorkspaceFiles } from '@/application/use-cases/file-operations/ListWorkspaceFiles';
import { ReadWorkspaceFile } from '@/application/use-cases/file-operations/ReadWorkspaceFile';
import { SearchWorkspaceFiles } from '@/application/use-cases/file-operations/SearchWorkspaceFiles';
import { NodeWorkspaceFileSystem } from '@/infrastructure/file-system/NodeWorkspaceFileSystem';
import { LocalToolExecutor } from '@/infrastructure/tools/LocalToolExecutor';
import { CreateFileProvider } from '@/infrastructure/tools/providers/CreateFileProvider';
import { EditFileProvider } from '@/infrastructure/tools/providers/EditFileProvider';
import { ListFilesProvider } from '@/infrastructure/tools/providers/ListFilesProvider';
import { ReadFileProvider } from '@/infrastructure/tools/providers/ReadFileProvider';
import { SearchFileProvider } from '@/infrastructure/tools/providers/SearchFileProvider';
import { RipgrepSearch } from '@/infrastructure/tools/ripgrep/RipgrepSearch';

const DEFAULT_MAX_FILE_BYTES = 200_000;
const DEFAULT_MAX_LIST_FILES = 500;

export type LocalToolExecutorOptions = {
	workspaceRoot?: string;
	maxFileBytes?: number;
	maxListFiles?: number;
	maxSearchMatches?: number;
	maxMatchTextLength?: number;
	searchTimeoutMs?: number;
};

export const createLocalToolExecutor = (
	options: LocalToolExecutorOptions = {},
): LocalToolExecutor => {
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
		[
			searchOptions.maxMatches,
			searchOptions.maxMatchTextLength,
			searchOptions.timeoutMs,
		].some((value) => !Number.isFinite(value) || value <= 0)
	) {
		throw new Error('Search limits must be positive numbers.');
	}

	return new LocalToolExecutor({
		listFilesProvider: new ListFilesProvider(
			new ListWorkspaceFiles(workspaceFiles),
			{
				maxEntries: options.maxListFiles ?? DEFAULT_MAX_LIST_FILES,
			},
		),
		readFileProvider: new ReadFileProvider(
			new ReadWorkspaceFile(workspaceFiles),
			{ maxFileBytes },
		),
		searchFileProvider: new SearchFileProvider(
			new SearchWorkspaceFiles(new RipgrepSearch(searchOptions)),
		),
		createFileProvider: new CreateFileProvider(
			new CreateWorkspaceFile(workspaceFiles),
			{ maxFileBytes },
		),
		editFileProvider: new EditFileProvider(
			new EditWorkspaceFile(workspaceFiles),
			{ maxFileBytes },
		),
	});
};
