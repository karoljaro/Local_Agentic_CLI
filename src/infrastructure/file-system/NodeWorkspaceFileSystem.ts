import type {
	DeleteWorkspacePathInput,
	FindWorkspaceFilesInput,
	ListWorkspaceDirectoryInput,
	MoveWorkspaceFileInput,
	ReadWorkspaceFileInput,
	WorkspaceDirectoryList,
	WorkspaceExecutionOptions,
	WorkspaceFile,
	WorkspaceFileList,
	WorkspaceFileMove,
	WorkspaceFilePort,
	WorkspacePathDeletion,
	WorkspacePathType,
	WriteWorkspaceFileInput,
} from '@/application/ports/WorkspaceFilePort';
import { throwIfAborted } from '@/application/services/cancellation';
import { randomUUID } from 'node:crypto';
import {
	link,
	lstat,
	mkdir,
	open,
	readdir,
	readFile as readFileContent,
	realpath,
	rename,
	rmdir,
	stat,
	unlink,
	writeFile as writeFileContent,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { isPathInside } from './isPathInside';
import { isProtectedDirectoryPath, isProtectedFilePath } from './workspacePolicy';

type ResolvedPath = { realWorkspaceRoot: string; realTargetPath: string; relativePath: string };
type WorkspaceTarget = { realWorkspaceRoot: string; targetPath: string; relativePath: string };
type Entry = { path: string; type: WorkspacePathType };
const MAX_TRAVERSAL_ENTRIES = 10_000;
const MAX_TRAVERSAL_DEPTH = 100;

export class NodeWorkspaceFileSystem implements WorkspaceFilePort {
	private readonly workspaceRoot: string;
	constructor(workspaceRoot: string) {
		this.workspaceRoot = resolve(workspaceRoot);
	}

	async listDirectory(
		input: ListWorkspaceDirectoryInput,
		options: WorkspaceExecutionOptions = {},
	): Promise<WorkspaceDirectoryList> {
		throwIfAborted(options.signal);
		validateEntriesLimit(input.maxEntries);
		if (!Number.isInteger(input.depth) || input.depth < 1 || input.depth > 5)
			throw new Error('Directory depth must be an integer from 1 to 5.');
		const scope = await this.resolveDiscoveryScope(input.path ?? '.', options.signal);
		if (scope === undefined) return { path: input.path ?? '.', entries: [], truncated: false };
		if (!(await withPathError(input.path ?? '.', () => stat(scope.realTargetPath))).isDirectory())
			throw new Error(`Path is not a directory: ${input.path ?? '.'}`);
		const result = await this.collectEntries(scope, input.depth, input.maxEntries, options.signal);
		return { path: scope.relativePath || '.', ...result };
	}

	async findFiles(
		input: FindWorkspaceFilesInput,
		options: WorkspaceExecutionOptions = {},
	): Promise<WorkspaceFileList> {
		throwIfAborted(options.signal);
		validateEntriesLimit(input.maxEntries);
		const matcher = compileFilePattern(input.pattern);
		const scope = await this.resolveDiscoveryScope(input.path ?? '.', options.signal);
		if (scope === undefined) return { files: [], truncated: false };
		const scopeStats = await withPathError(input.path ?? '.', () => stat(scope.realTargetPath));
		throwIfAborted(options.signal);
		if (scopeStats.isFile())
			return {
				files: matcher(basename(scope.realTargetPath)) ? [scope.relativePath] : [],
				truncated: false,
			};
		if (!scopeStats.isDirectory()) throw new Error(`Path is not a directory: ${input.path ?? '.'}`);
		const result = await this.collectEntries(
			scope,
			MAX_TRAVERSAL_DEPTH,
			input.maxEntries,
			options.signal,
			(entry) =>
				entry.type === 'file' &&
				matcher(
					normalizedPath(
						relative(scope.realTargetPath, resolve(scope.realWorkspaceRoot, entry.path)),
					),
				),
		);
		return { files: result.entries.map((entry) => entry.path), truncated: result.truncated };
	}

	async readFile(
		input: ReadWorkspaceFileInput,
		options: WorkspaceExecutionOptions = {},
	): Promise<WorkspaceFile> {
		const file = await this.resolveExistingFile(input.path, input.maxFileBytes, options.signal);
		throwIfAborted(options.signal);
		const content = await withPathError(input.path, () =>
			readFileContent(file.realTargetPath, 'utf8'),
		);
		throwIfAborted(options.signal);
		return { path: file.relativePath, content };
	}

	async writeFile(
		input: WriteWorkspaceFileInput,
		options: WorkspaceExecutionOptions = {},
	): Promise<WorkspaceFile> {
		const { signal } = options;
		const file = await this.resolveExistingFile(input.path, input.maxFileBytes, signal);
		ensureContentWithinLimit(input);
		const fileStats = await withPathError(input.path, () => stat(file.realTargetPath));
		throwIfAborted(signal);
		if (input.expectedContent !== undefined) {
			const current = await withPathError(input.path, () =>
				readFileContent(file.realTargetPath, 'utf8'),
			);
			if (current !== input.expectedContent)
				throw new Error(`File changed since it was read; read it again: ${input.path}`);
		}
		throwIfAborted(signal);
		// Await publication and cleanup once writing begins, even if cancellation arrives.
		await withPathError(input.path, () =>
			writeFileAtomically(
				file.realTargetPath,
				input.content,
				fileStats.mode,
				file.realWorkspaceRoot,
			),
		);
		return { path: file.relativePath, content: input.content };
	}

	async createFile(
		input: WriteWorkspaceFileInput,
		options: WorkspaceExecutionOptions = {},
	): Promise<WorkspaceFile> {
		throwIfAborted(options.signal);
		ensureContentWithinLimit(input);
		const file = await this.resolveNewFilePath(input.path, options.signal, false);
		throwIfAborted(options.signal);
		const warnings = await withPathError(input.path, () =>
			createFileAtomically(file.realTargetPath, input.content, file.realWorkspaceRoot),
		);
		return {
			path: file.relativePath,
			content: input.content,
			...(warnings === undefined ? {} : { warnings }),
		};
	}

	async moveFile(
		input: MoveWorkspaceFileInput,
		options: WorkspaceExecutionOptions = {},
	): Promise<WorkspaceFileMove> {
		assertFilePath(input.source);
		const source = await this.resolveWorkspacePath(input.source, options.signal, true);
		const sourceStats = await withPathError(input.source, () => lstat(source.realTargetPath));
		if (!sourceStats.isFile()) throw new Error(`Path is not a regular file: ${input.source}`);
		const destination = await this.resolveNewFilePath(input.destination, options.signal, true);
		throwIfAborted(options.signal);
		// Exclusive publication and source removal are two mutations, not an atomic rename.
		await withPathError(input.destination, () =>
			link(source.realTargetPath, destination.realTargetPath),
		);
		try {
			await unlink(source.realTargetPath);
		} catch (error) {
			if (!hasCode(error, 'ENOENT')) {
				throw new Error(
					`Destination created; source removal failed. Check both paths: ${source.relativePath} -> ${destination.relativePath}`,
					{ cause: error },
				);
			}
		}
		return { source: source.relativePath, destination: destination.relativePath, moved: true };
	}

	async deletePath(
		input: DeleteWorkspacePathInput,
		options: WorkspaceExecutionOptions = {},
	): Promise<WorkspacePathDeletion> {
		const target = await this.resolveWorkspacePath(input.path, options.signal, true);
		if (target.relativePath.length === 0) throw new Error('Cannot delete the workspace root.');
		const targetStats = await withPathError(input.path, () => lstat(target.realTargetPath));
		const type = targetStats.isDirectory() ? 'directory' : 'file';
		if (type === 'directory') {
			assertAllowedDirectory(target.relativePath, input.path);
			assertAllowedDirectory(input.path, input.path);
			const entries = await withPathError(input.path, () => readdir(target.realTargetPath));
			if (entries.length > 0)
				throw new Error(`Directory is not empty; delete its files individually: ${input.path}`);
		} else {
			if (!targetStats.isFile())
				throw new Error(`Path is not a regular file or directory: ${input.path}`);
			assertFilePath(input.path);
		}
		throwIfAborted(options.signal);
		await withPathError(input.path, () =>
			type === 'directory' ? rmdir(target.realTargetPath) : unlink(target.realTargetPath),
		);
		return { path: target.relativePath, type, deleted: true };
	}

	private async resolveDiscoveryScope(
		inputPath: string,
		signal?: AbortSignal,
	): Promise<ResolvedPath | undefined> {
		const target = await this.resolveWorkspaceTarget(inputPath, signal);
		if (isProtectedFilePath(inputPath) || isProtectedFilePath(target.relativePath))
			return undefined;
		const realTargetPath = await withPathError(inputPath, () => realpath(target.targetPath));
		throwIfAborted(signal);
		assertContained(target.realWorkspaceRoot, realTargetPath, inputPath);
		const relativePath = normalizedPath(relative(target.realWorkspaceRoot, realTargetPath));
		if (isProtectedFilePath(relativePath)) return undefined;
		const targetStats = await withPathError(inputPath, () => stat(realTargetPath));
		if (
			targetStats.isDirectory() &&
			(isProtectedDirectoryPath(relativePath) || isProtectedDirectoryPath(inputPath))
		)
			return undefined;
		throwIfAborted(signal);
		return { realWorkspaceRoot: target.realWorkspaceRoot, realTargetPath, relativePath };
	}

	private async resolveExistingFile(
		inputPath: string,
		maxFileBytes: number,
		signal?: AbortSignal,
	): Promise<ResolvedPath> {
		assertFilePath(inputPath);
		const target = await this.resolveWorkspacePath(inputPath, signal);
		const stats = await withPathError(inputPath, () => stat(target.realTargetPath));
		throwIfAborted(signal);
		if (stats.isDirectory()) {
			assertAllowedDirectory(inputPath, inputPath);
			assertAllowedDirectory(target.relativePath, inputPath);
		}
		if (!stats.isFile()) throw new Error(`Path is not a file: ${inputPath}`);
		if (stats.size > maxFileBytes) throw new Error(`File is too large: ${inputPath}`);
		return target;
	}

	private async resolveWorkspacePath(
		inputPath: string,
		signal?: AbortSignal,
		rejectSymlinks = false,
	): Promise<ResolvedPath> {
		const target = await this.resolveWorkspaceTarget(inputPath, signal);
		assertAllowedFile(inputPath, inputPath);
		assertAllowedFile(target.relativePath, inputPath);
		if (rejectSymlinks) await assertNoSymlinks(target, inputPath, signal);
		const realTargetPath = await withPathError(inputPath, () => realpath(target.targetPath));
		throwIfAborted(signal);
		assertContained(target.realWorkspaceRoot, realTargetPath, inputPath);
		const relativePath = normalizedPath(relative(target.realWorkspaceRoot, realTargetPath));
		assertAllowedFile(relativePath, inputPath);
		return { realWorkspaceRoot: target.realWorkspaceRoot, realTargetPath, relativePath };
	}

	private async resolveNewFilePath(
		inputPath: string,
		signal: AbortSignal | undefined,
		rejectSymlinks: boolean,
	): Promise<ResolvedPath> {
		assertFilePath(inputPath);
		const target = await this.resolveWorkspaceTarget(inputPath, signal);
		if (!target.relativePath.length) throw new Error('Path must name a file inside the workspace.');
		assertAllowedFile(inputPath, inputPath);
		assertAllowedFile(target.relativePath, inputPath);
		const parts = target.relativePath.split('/');
		const name = parts.pop();
		let parent = target.realWorkspaceRoot;
		for (const part of parts) {
			throwIfAborted(signal);
			const candidate = resolve(parent, part);
			let candidateStats = await lstat(candidate).catch((error: unknown) => {
				if (hasCode(error, 'ENOENT')) return undefined;
				throw pathError(error, inputPath);
			});
			throwIfAborted(signal);
			if (candidateStats === undefined) {
				// Only this checked segment is created. Empty parents may remain after failure.
				await withPathError(inputPath, () =>
					mkdir(candidate).catch((error: unknown) => {
						if (!hasCode(error, 'EEXIST')) throw error;
					}),
				);
				throwIfAborted(signal);
				candidateStats = await withPathError(inputPath, () => lstat(candidate));
			}
			if (rejectSymlinks && candidateStats.isSymbolicLink())
				throw new Error(`Symbolic links are not allowed for this operation: ${inputPath}`);
			parent = await withPathError(inputPath, () => realpath(candidate));
			throwIfAborted(signal);
			assertContained(target.realWorkspaceRoot, parent, inputPath);
			assertAllowedDirectory(normalizedPath(relative(target.realWorkspaceRoot, parent)), inputPath);
			if (!(await withPathError(inputPath, () => stat(parent))).isDirectory())
				throw new Error(`Parent is not a directory: ${inputPath}`);
		}
		const realTargetPath = resolve(parent, name ?? '');
		const relativePath = normalizedPath(relative(target.realWorkspaceRoot, realTargetPath));
		assertAllowedFile(relativePath, inputPath);
		throwIfAborted(signal);
		const existing = await lstat(realTargetPath).catch((error: unknown) => {
			if (hasCode(error, 'ENOENT')) return undefined;
			throw pathError(error, inputPath);
		});
		throwIfAborted(signal);
		if (existing !== undefined) {
			if (existing.isDirectory()) assertAllowedDirectory(relativePath, inputPath);
			if (rejectSymlinks && existing.isSymbolicLink())
				throw new Error(`Symbolic links are not allowed for this operation: ${inputPath}`);
			throw new Error(`File already exists: ${inputPath}`);
		}
		return { realWorkspaceRoot: target.realWorkspaceRoot, realTargetPath, relativePath };
	}

	private async resolveWorkspaceTarget(
		inputPath: string,
		signal?: AbortSignal,
	): Promise<WorkspaceTarget> {
		throwIfAborted(signal);
		if (!inputPath.trim().length) throw new Error('File path cannot be empty.');
		if (isAbsolute(inputPath) || win32.isAbsolute(inputPath) || /^[A-Za-z]:/.test(inputPath))
			throw new Error('Workspace file path must be relative.');
		if (inputPath.includes('\\') || inputPath.includes('\0'))
			throw new Error('Workspace paths must use / separators and contain no null characters.');
		if (process.platform === 'win32' && inputPath.includes(':')) {
			throw new Error('Workspace paths cannot select Windows alternate data streams.');
		}
		if (
			process.platform === 'win32' &&
			inputPath
				.split('/')
				.some(
					(part) =>
						part !== '.' &&
						part !== '..' &&
						(/[. ]$/.test(part) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)),
				)
		)
			throw new Error(`Unsupported Windows path component: ${inputPath}`);
		const realWorkspaceRoot = await realpath(this.workspaceRoot);
		throwIfAborted(signal);
		const targetPath = resolve(realWorkspaceRoot, inputPath);
		assertContained(realWorkspaceRoot, targetPath, inputPath);
		return {
			realWorkspaceRoot,
			targetPath,
			relativePath: normalizedPath(relative(realWorkspaceRoot, targetPath)),
		};
	}

	private async collectEntries(
		scope: ResolvedPath,
		maxDepth: number,
		maxEntries: number,
		signal?: AbortSignal,
		include: (entry: Entry) => boolean = () => true,
	): Promise<{ entries: Entry[]; truncated: boolean }> {
		const entries: Entry[] = [];
		let examined = 0;
		let truncated = false;
		const visit = async (directory: string, depth: number): Promise<void> => {
			throwIfAborted(signal);
			const children = await withPathError(scope.relativePath || '.', () =>
				readdir(directory, { withFileTypes: true }),
			);
			throwIfAborted(signal);
			children.sort((left, right) => comparePaths(left.name, right.name));
			for (const child of children) {
				throwIfAborted(signal);
				if (++examined > MAX_TRAVERSAL_ENTRIES) {
					truncated = true;
					return;
				}
				// Omit symlinks: no cycles, aliases, escapes, or duplicate discovery results.
				if (!child.isFile() && !child.isDirectory()) continue;
				const childPath = resolve(directory, child.name);
				const path = normalizedPath(relative(scope.realWorkspaceRoot, childPath));
				const type = child.isDirectory() ? 'directory' : 'file';
				if (type === 'directory' ? isProtectedDirectoryPath(path) : isProtectedFilePath(path))
					continue;
				const canonical = await realpath(childPath).catch(() => undefined);
				throwIfAborted(signal);
				if (canonical === undefined || !isPathInside(scope.realWorkspaceRoot, canonical)) continue;
				const canonicalPath = normalizedPath(relative(scope.realWorkspaceRoot, canonical));
				if (
					type === 'directory'
						? isProtectedDirectoryPath(canonicalPath)
						: isProtectedFilePath(canonicalPath)
				)
					continue;
				const entry: Entry = { path, type };
				if (include(entry)) {
					if (entries.length >= maxEntries) {
						truncated = true;
						return;
					}
					entries.push(entry);
				}
				if (type === 'directory') {
					if (depth < maxDepth) await visit(canonical, depth + 1);
					else if (maxDepth === MAX_TRAVERSAL_DEPTH) truncated = true;
					if (truncated) return;
				}
			}
		};
		await visit(scope.realTargetPath, 1);
		return { entries, truncated };
	}
}

const normalizedPath = (path: string): string => path.split(sep).join('/');
const assertFilePath = (path: string): void => {
	if (path.endsWith('/')) throw new Error(`File path must not end with /: ${path}`);
};
const comparePaths = (left: string, right: string): number =>
	left < right ? -1 : left > right ? 1 : 0;
const validateEntriesLimit = (limit: number): void => {
	if (!Number.isInteger(limit) || limit <= 0)
		throw new Error('Max list entries must be a positive integer.');
};
const assertContained = (root: string, target: string, input: string): void => {
	if (!isPathInside(root, target))
		throw new Error(`Cannot access file outside workspace: ${input}`);
};
const assertAllowedFile = (path: string, input: string): void => {
	if (isProtectedFilePath(path)) throw new Error(`Cannot access protected file: ${input}`);
};
const assertAllowedDirectory = (path: string, input: string): void => {
	if (isProtectedDirectoryPath(path))
		throw new Error(`Cannot access protected directory: ${input}`);
};
const assertNoSymlinks = async (
	target: WorkspaceTarget,
	input: string,
	signal?: AbortSignal,
): Promise<void> => {
	let current = target.realWorkspaceRoot;
	for (const part of target.relativePath.split('/').filter(Boolean)) {
		throwIfAborted(signal);
		current = resolve(current, part);
		const stats = await withPathError(input, () => lstat(current));
		if (stats.isSymbolicLink())
			throw new Error(`Symbolic links are not allowed for this operation: ${input}`);
	}
	throwIfAborted(signal);
};
const ensureContentWithinLimit = (input: WriteWorkspaceFileInput): void => {
	if (new TextEncoder().encode(input.content).length > input.maxFileBytes)
		throw new Error(`File content is too large: ${input.path}`);
};
type GlobToken =
	| { kind: 'literal'; value: string }
	| { kind: 'star' | 'globstar' | 'question' | 'directories' | 'directoryTail' };

const compileFilePattern = (pattern: string): ((path: string) => boolean) => {
	if (
		!pattern.length ||
		pattern.length > 200 ||
		pattern.includes('\\') ||
		isAbsolute(pattern) ||
		win32.isAbsolute(pattern) ||
		/^[A-Za-z]:/.test(pattern) ||
		pattern.split('/').includes('..') ||
		/[\[\]{}\0]/.test(pattern)
	)
		throw new Error(
			'File pattern must be relative, at most 200 characters, and use only *, **, ? wildcards.',
		);
	const tokens: GlobToken[] = [];
	const characters = Array.from(pattern);
	for (let index = 0; index < characters.length; index++) {
		const value = characters[index] ?? '';
		if (value === '*' && characters[index + 1] === '*') {
			if (characters[index + 2] === '/') {
				// Adjacent **/ segments are equivalent to one and need no extra states.
				if (tokens.at(-1)?.kind !== 'directoryTail')
					tokens.push({ kind: 'directories' }, { kind: 'directoryTail' });
				index += 2;
			} else {
				if (tokens.at(-1)?.kind !== 'globstar') tokens.push({ kind: 'globstar' });
				index++;
			}
		} else if (value === '*') tokens.push({ kind: 'star' });
		else if (value === '?') tokens.push({ kind: 'question' });
		else tokens.push({ kind: 'literal', value });
	}
	const close = (states: Uint8Array): void => {
		for (let index = 0; index < tokens.length; index++) {
			if (!states[index]) continue;
			const token = tokens[index];
			if (token?.kind === 'star' || token?.kind === 'globstar') states[index + 1] = 1;
			else if (token?.kind === 'directories') states[index + 2] = 1;
		}
	};
	return (path) => {
		const candidate = pattern.includes('/') ? path : (path.split('/').at(-1) ?? '');
		let states = new Uint8Array(tokens.length + 1);
		states[0] = 1;
		close(states);
		// Finite-state matching takes O(pattern length × path length), never backtracks.
		for (const character of candidate) {
			const next = new Uint8Array(tokens.length + 1);
			let active = false;
			for (let index = 0; index < tokens.length; index++) {
				if (!states[index]) continue;
				const token = tokens[index];
				if (token?.kind === 'literal' && token.value === character) {
					next[index + 1] = 1;
					active = true;
				} else if (token?.kind === 'question' && character !== '/') {
					next[index + 1] = 1;
					active = true;
				} else if ((token?.kind === 'star' && character !== '/') || token?.kind === 'globstar') {
					next[index] = 1;
					active = true;
				} else if (token?.kind === 'directories') {
					next[index + 1] = 1;
					if (character === '/') next[index + 2] = 1;
					active = true;
				} else if (token?.kind === 'directoryTail') {
					next[index] = 1;
					if (character === '/') next[index + 1] = 1;
					active = true;
				}
			}
			if (!active) return false;
			close(next);
			states = next;
		}
		return states[tokens.length] === 1;
	};
};

const temporaryPathFor = (target: string): string =>
	resolve(dirname(target), `.tmp-${basename(target)}-${process.pid}-${randomUUID()}`);
const reserveTemporaryFile = async (
	temporary: string,
	path: string,
	mode?: number,
): Promise<Awaited<ReturnType<typeof open>>> => {
	let handle;
	try {
		handle = await open(temporary, 'wx', mode);
	} catch (error) {
		if (hasCode(error, 'EEXIST'))
			throw new Error(`Could not reserve a temporary file; retry: ${path}`);
		throw error;
	}
	return handle;
};
const cleanupFailure = (error: unknown, path: string, temporary: string): Error => {
	const normalized = pathError(error, path);
	const message = normalized instanceof Error ? normalized.message : 'Filesystem operation failed';
	return new Error(`${message}; temporary file could not be removed: ${temporary}`, {
		cause: error,
	});
};
const removeOwnedTemporary = async (temporary: string): Promise<void> => {
	try {
		await unlink(temporary);
	} catch (error) {
		if (!hasCode(error, 'ENOENT')) throw error;
	}
};
const createFileAtomically = async (
	target: string,
	content: string,
	root: string,
): Promise<string[] | undefined> => {
	const temporary = temporaryPathFor(target);
	const path = normalizedPath(relative(root, target));
	const relativeTemporary = normalizedPath(relative(root, temporary));
	let owned = false;
	let published = false;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	let failure: { error: unknown } | undefined;
	try {
		handle = await reserveTemporaryFile(temporary, path);
		owned = true;
		await writeFileContent(handle, content, { encoding: 'utf8' });
		await handle.close();
		handle = undefined;
		await link(temporary, target);
		published = true;
	} catch (error) {
		failure = { error };
	}
	await handle?.close().catch(() => undefined);
	if (owned) {
		try {
			await removeOwnedTemporary(temporary);
		} catch {
			if (published)
				return [`File created; delete the leftover temporary file: ${relativeTemporary}`];
			if (failure !== undefined) throw cleanupFailure(failure.error, path, relativeTemporary);
		}
	}
	if (failure !== undefined) throw failure.error;
	return undefined;
};
const writeFileAtomically = async (
	target: string,
	content: string,
	mode: number,
	root: string,
): Promise<void> => {
	const temporary = temporaryPathFor(target);
	const path = normalizedPath(relative(root, target));
	let owned = false;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await reserveTemporaryFile(temporary, path, mode);
		owned = true;
		await writeFileContent(handle, content, { encoding: 'utf8' });
		await handle.close();
		handle = undefined;
		await rename(temporary, target);
	} catch (error) {
		await handle?.close().catch(() => undefined);
		if (owned) {
			try {
				await removeOwnedTemporary(temporary);
			} catch {
				throw cleanupFailure(error, path, normalizedPath(relative(root, temporary)));
			}
		}
		throw error;
	}
};
const hasCode = (error: unknown, code: string): boolean =>
	typeof error === 'object' && error !== null && 'code' in error && error.code === code;
const pathError = (error: unknown, path: string): unknown => {
	if (hasCode(error, 'ENOENT')) return new Error(`Path not found: ${path}`);
	if (hasCode(error, 'ENOTDIR')) return new Error(`Parent is not a directory: ${path}`);
	if (hasCode(error, 'EEXIST')) return new Error(`File already exists: ${path}`);
	if (hasCode(error, 'ENOTEMPTY')) return new Error(`Directory is not empty: ${path}`);
	if (hasCode(error, 'EACCES') || hasCode(error, 'EPERM'))
		return new Error(`Permission denied: ${path}`);
	if (hasCode(error, 'EXDEV'))
		return new Error(`Operation crosses filesystem boundaries and is unavailable: ${path}`);
	if (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		typeof error.code === 'string'
	) {
		return new Error(`Filesystem operation failed (${error.code}): ${path}`);
	}
	return error;
};
const withPathError = async <T>(path: string, action: () => Promise<T>): Promise<T> => {
	try {
		return await action();
	} catch (error) {
		throw pathError(error, path);
	}
};
