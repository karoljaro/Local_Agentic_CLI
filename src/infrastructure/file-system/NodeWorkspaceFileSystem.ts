import type {
	ReadWorkspaceFileInput,
	WorkspaceFile,
	WorkspaceFilePort,
	WriteWorkspaceFileInput,
} from '@/application/ports/WorkspaceFilePort';

import {
	realpath,
	readFile as readFileContent,
	stat,
	writeFile as writeFileContent,
} from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { isPathInside } from './isPathInside';

type ResolvedWorkspaceFile = {
	realTargetPath: string;
	relativePath: string;
};

export class NodeWorkspaceFileSystem implements WorkspaceFilePort {
	private readonly workspaceRoot: string;

	constructor(workspaceRoot: string) {
		this.workspaceRoot = resolve(workspaceRoot);
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

		if (
			new TextEncoder().encode(input.content).length > input.maxFileBytes
		) {
			throw new Error(`File content is too large: ${input.path}`);
		}

		await writeFileContent(file.realTargetPath, input.content, 'utf8');

		return {
			path: file.relativePath,
			content: input.content,
		};
	}

	private async resolveExistingFile(
		inputPath: string,
		maxFileBytes: number
	): Promise<ResolvedWorkspaceFile> {
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

		const realTargetPath = await realpath(targetPath);

		if (!isPathInside(realWorkspaceRoot, realTargetPath)) {
			throw new Error(
				`Cannot access file outside workspace: ${inputPath}`
			);
		}

		const fileStats = await stat(realTargetPath);

		if (!fileStats.isFile()) {
			throw new Error(`Path is not a file: ${inputPath}`);
		}

		if (fileStats.size > maxFileBytes) {
			throw new Error(`File is too large: ${inputPath}`);
		}

		return {
			realTargetPath,
			relativePath: relative(realWorkspaceRoot, realTargetPath),
		};
	}

}
