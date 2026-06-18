import type {
	ListWorkspaceFilesInput,
	ReadWorkspaceFileInput,
	WorkspaceFile,
	WorkspaceFileList,
	WorkspaceFilePort,
	WriteWorkspaceFileInput,
} from '@/application/ports/WorkspaceFilePort';

import {
	readdir,
	realpath,
	readFile as readFileContent,
	stat,
	writeFile as writeFileContent,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

import { isPathInside } from './isPathInside';

type ResolvedWorkspaceFile = {
	realTargetPath: string;
	relativePath: string;
};

type ResolvedWorkspacePath = ResolvedWorkspaceFile & {
	realWorkspaceRoot: string;
};

type WorkspaceTarget = {
	realWorkspaceRoot: string;
	targetPath: string;
};

type CollectFilesInput = {
	directoryPath: string;
	realWorkspaceRoot: string;
	files: string[];
	seenFiles: Set<string>;
	visitedDirectories: Set<string>;
	maxEntries: number;
};

const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', '.agent']);
const SAFE_ENV_FILES = new Set([
	'.env.dev',
	'.env.development',
	'.env.example',
]);

export class NodeWorkspaceFileSystem implements WorkspaceFilePort {
	private readonly workspaceRoot: string;

	constructor(workspaceRoot: string) {
		this.workspaceRoot = resolve(workspaceRoot);
	}

	async listFiles(
		input: ListWorkspaceFilesInput
	): Promise<WorkspaceFileList> {
		if (!Number.isInteger(input.maxEntries) || input.maxEntries <= 0) {
			throw new Error('Max list entries must be a positive integer.');
		}

		const target = await this.resolveWorkspacePath(input.path ?? '.');
		const targetStats = await stat(target.realTargetPath);

		if (targetStats.isFile()) {
			return shouldSkipFilePath(target.relativePath)
				? { files: [], truncated: false }
				: { files: [target.relativePath], truncated: false };
		}

		if (!targetStats.isDirectory()) {
			throw new Error(
				`Path is not a file or directory: ${input.path ?? '.'}`
			);
		}

		if (shouldSkipDirectoryPath(target.relativePath)) {
			return { files: [], truncated: false };
		}

		const files: string[] = [];
		const truncated = await this.collectFiles({
			directoryPath: target.realTargetPath,
			realWorkspaceRoot: target.realWorkspaceRoot,
			files,
			seenFiles: new Set<string>(),
			visitedDirectories: new Set<string>(),
			maxEntries: input.maxEntries,
		});

		return { files, truncated };
	}

	async readFile(input: ReadWorkspaceFileInput): Promise<WorkspaceFile> {
		const file = await this.resolveExistingFile(
			input.path,
			input.maxFileBytes
		);

		return {
			path: file.relativePath,
			content: await readFileContent(file.realTargetPath, 'utf8'),
		};
	}

	async writeFile(input: WriteWorkspaceFileInput): Promise<WorkspaceFile> {
		const file = await this.resolveExistingFile(
			input.path,
			input.maxFileBytes
		);

		ensureContentWithinLimit(input);

		await writeFileContent(file.realTargetPath, input.content, 'utf8');

		return {
			path: file.relativePath,
			content: input.content,
		};
	}

	async createFile(input: WriteWorkspaceFileInput): Promise<WorkspaceFile> {
		ensureContentWithinLimit(input);

		const file = await this.resolveNewFilePath(input.path);

		try {
			await writeFileContent(file.realTargetPath, input.content, {
				encoding: 'utf8',
				flag: 'wx',
			});
		} catch (error) {
			if (
				error instanceof Error &&
				'code' in error &&
				error.code === 'EEXIST'
			) {
				throw new Error(`File already exists: ${input.path}`);
			}

			throw error;
		}

		return {
			path: file.relativePath,
			content: input.content,
		};
	}

	private async resolveNewFilePath(
		inputPath: string
	): Promise<ResolvedWorkspaceFile> {
		const target = await this.resolveWorkspaceTarget(inputPath);
		const relativeTargetPath = relative(
			target.realWorkspaceRoot,
			target.targetPath
		);

		if (shouldSkipFilePath(relativeTargetPath)) {
			throw new Error(`Cannot access protected file: ${inputPath}`);
		}

		const realParentPath = await realpath(dirname(target.targetPath));

		if (!isPathInside(target.realWorkspaceRoot, realParentPath)) {
			throw new Error(
				`Cannot access file outside workspace: ${inputPath}`
			);
		}

		const realTargetPath = resolve(
			realParentPath,
			basename(target.targetPath)
		);
		const relativePath = relative(
			target.realWorkspaceRoot,
			realTargetPath
		);

		if (shouldSkipFilePath(relativePath)) {
			throw new Error(`Cannot access protected file: ${inputPath}`);
		}

		return {
			realTargetPath,
			relativePath,
		};
	}

	private async resolveExistingFile(
		inputPath: string,
		maxFileBytes: number
	): Promise<ResolvedWorkspaceFile> {
		const resolvedPath = await this.resolveWorkspacePath(inputPath);

		if (shouldSkipFilePath(resolvedPath.relativePath)) {
			throw new Error(`Cannot access protected file: ${inputPath}`);
		}

		const fileStats = await stat(resolvedPath.realTargetPath);

		if (!fileStats.isFile()) {
			throw new Error(`Path is not a file: ${inputPath}`);
		}

		if (fileStats.size > maxFileBytes) {
			throw new Error(`File is too large: ${inputPath}`);
		}

		return {
			realTargetPath: resolvedPath.realTargetPath,
			relativePath: resolvedPath.relativePath,
		};
	}

	private async resolveWorkspacePath(
		inputPath: string
	): Promise<ResolvedWorkspacePath> {
		const target = await this.resolveWorkspaceTarget(inputPath);
		const realTargetPath = await realpath(target.targetPath);

		if (!isPathInside(target.realWorkspaceRoot, realTargetPath)) {
			throw new Error(
				`Cannot access file outside workspace: ${inputPath}`
			);
		}

		return {
			realWorkspaceRoot: target.realWorkspaceRoot,
			realTargetPath,
			relativePath: relative(target.realWorkspaceRoot, realTargetPath),
		};
	}

	private async resolveWorkspaceTarget(
		inputPath: string
	): Promise<WorkspaceTarget> {
		if (!inputPath.trim().length) {
			throw new Error('File path cannot be empty.');
		}

		if (isAbsolute(inputPath)) {
			throw new Error('Workspace file path must be relative.');
		}

		const realWorkspaceRoot = await realpath(this.workspaceRoot);
		const targetPath = resolve(realWorkspaceRoot, inputPath);

		if (!isPathInside(realWorkspaceRoot, targetPath)) {
			throw new Error(
				`Cannot access file outside workspace: ${inputPath}`
			);
		}

		return {
			realWorkspaceRoot,
			targetPath,
		};
	}

	private async collectFiles(input: CollectFilesInput): Promise<boolean> {
		if (input.visitedDirectories.has(input.directoryPath)) {
			return false;
		}

		input.visitedDirectories.add(input.directoryPath);

		const entries = await readdir(input.directoryPath, {
			withFileTypes: true,
		});

		entries.sort((left, right) => left.name.localeCompare(right.name));

		for (const entry of entries) {
			if (
				(entry.isDirectory() && shouldSkipDirectoryName(entry.name)) ||
				(entry.isFile() && shouldSkipFileName(entry.name))
			) {
				continue;
			}

			const entryPath = resolve(input.directoryPath, entry.name);
			const realEntryPath = await realpath(entryPath).catch(
				() => undefined
			);

			if (
				realEntryPath === undefined ||
				!isPathInside(input.realWorkspaceRoot, realEntryPath)
			) {
				continue;
			}

			const relativePath = relative(
				input.realWorkspaceRoot,
				realEntryPath
			);
			const entryStats = await stat(realEntryPath);

			if (entryStats.isDirectory()) {
				if (shouldSkipDirectoryPath(relativePath)) {
					continue;
				}

				const truncated = await this.collectFiles({
					...input,
					directoryPath: realEntryPath,
				});

				if (truncated) {
					return true;
				}

				continue;
			}

			if (
				!entryStats.isFile() ||
				shouldSkipFilePath(relativePath) ||
				input.seenFiles.has(relativePath)
			) {
				continue;
			}

			if (input.files.length >= input.maxEntries) {
				return true;
			}

			input.seenFiles.add(relativePath);
			input.files.push(relativePath);
		}

		return false;
	}
}

const shouldSkipDirectoryPath = (path: string): boolean => {
	return splitPath(path).some(shouldSkipDirectoryName);
};

const shouldSkipFilePath = (path: string): boolean => {
	const parts = splitPath(path);
	const fileName = parts.pop() ?? '';

	return parts.some(shouldSkipDirectoryName) || shouldSkipFileName(fileName);
};

const shouldSkipDirectoryName = (name: string): boolean => {
	return EXCLUDED_DIRECTORIES.has(name) || name.startsWith('.env');
};

const shouldSkipFileName = (name: string): boolean => {
	return name.startsWith('.env') && !SAFE_ENV_FILES.has(name);
};

const splitPath = (path: string): string[] => {
	return path.split(/[\\/]+/).filter(Boolean);
};

const ensureContentWithinLimit = (
	input: WriteWorkspaceFileInput
): void => {
	if (new TextEncoder().encode(input.content).length > input.maxFileBytes) {
		throw new Error(`File content is too large: ${input.path}`);
	}
};
