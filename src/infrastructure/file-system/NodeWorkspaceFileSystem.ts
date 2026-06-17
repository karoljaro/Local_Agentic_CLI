import type {
	ReadWorkspaceFileInput,
	WorkspaceFile,
	WorkspaceFilePort,
} from '@/application/ports/WorkspaceFilePort';

import { realpath, readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export class NodeWorkspaceFileSystem implements WorkspaceFilePort {
	private readonly workspaceRoot: string;

	constructor(workspaceRoot: string) {
		this.workspaceRoot = resolve(workspaceRoot);
	}

	async readFile(input: ReadWorkspaceFileInput): Promise<WorkspaceFile> {
		if (!input.path.trim().length) {
			throw new Error('File path cannot be empty.');
		}

		if (isAbsolute(input.path)) {
			throw new Error('Workspace file path must be relative.');
		}

		const realWorkspaceRoot = await realpath(this.workspaceRoot);
		const targetPath = resolve(realWorkspaceRoot, input.path);

		if (!this.isPathInside(realWorkspaceRoot, targetPath)) {
			throw new Error(`Cannot access file outside workspace: ${input.path}`);
		}

		const realTargetPath = await realpath(targetPath);

		if (!this.isPathInside(realWorkspaceRoot, realTargetPath)) {
			throw new Error(`Cannot access file outside workspace: ${input.path}`);
		}

		const fileStats = await stat(realTargetPath);

		if (!fileStats.isFile()) {
			throw new Error(`Path is not a file: ${input.path}`);
		}

		if (fileStats.size > input.maxFileBytes) {
			throw new Error(`File is too large: ${input.path}`);
		}

		return {
			path: relative(realWorkspaceRoot, realTargetPath),
			content: await readFile(realTargetPath, 'utf8'),
		};
	}

	private isPathInside(parentPath: string, childPath: string): boolean {
		const relativePath = relative(parentPath, childPath);

		return (
			relativePath === '' ||
			(!relativePath.startsWith('..') && !isAbsolute(relativePath))
		);
	}
}
