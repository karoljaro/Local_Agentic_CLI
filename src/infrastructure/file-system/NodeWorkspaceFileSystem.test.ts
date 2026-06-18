import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { NodeWorkspaceFileSystem } from './NodeWorkspaceFileSystem';

const MAX_FILE_BYTES = 1024;

const createTempWorkspace = async (): Promise<{
	directory: string;
	fileSystem: NodeWorkspaceFileSystem;
	cleanup: () => Promise<void>;
}> => {
	const directory = await mkdtemp(join(tmpdir(), 'workspace-file-system-'));

	return {
		directory,
		fileSystem: new NodeWorkspaceFileSystem(directory),
		cleanup: () => rm(directory, { recursive: true, force: true }),
	};
};

describe('NodeWorkspaceFileSystem', () => {
	describe('listFiles', () => {
		test('lists workspace files recursively in path order', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await mkdir(join(directory, 'src', 'nested'), {
					recursive: true,
				});
				await writeFile(
					join(directory, 'src', 'nested', 'second.ts'),
					'second',
					'utf8',
				);
				await writeFile(
					join(directory, 'src', 'first.ts'),
					'first',
					'utf8',
				);

				await expect(
					fileSystem.listFiles({ maxEntries: 10 }),
				).resolves.toEqual({
					files: ['src/first.ts', 'src/nested/second.ts'],
					truncated: false,
				});
			} finally {
				await cleanup();
			}
		});

		test('lists files under a relative path', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await mkdir(join(directory, 'src'));
				await mkdir(join(directory, 'tests'));
				await writeFile(
					join(directory, 'src', 'file.ts'),
					'source',
					'utf8',
				);
				await writeFile(
					join(directory, 'tests', 'file.test.ts'),
					'test',
					'utf8',
				);

				await expect(
					fileSystem.listFiles({
						path: 'src',
						maxEntries: 10,
					}),
				).resolves.toEqual({
					files: ['src/file.ts'],
					truncated: false,
				});
			} finally {
				await cleanup();
			}
		});

		test('excludes internal directories and unsafe env files', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await mkdir(join(directory, '.agent'));
				await mkdir(join(directory, '.git'));
				await mkdir(join(directory, 'node_modules', 'pkg'), {
					recursive: true,
				});
				await writeFile(
					join(directory, '.agent', 'events.jsonl'),
					'event',
					'utf8',
				);
				await writeFile(
					join(directory, '.git', 'config'),
					'git',
					'utf8',
				);
				await writeFile(
					join(directory, 'node_modules', 'pkg', 'index.js'),
					'module',
					'utf8',
				);
				await writeFile(
					join(directory, '.env'),
					'SECRET=value',
					'utf8',
				);
				await writeFile(
					join(directory, '.env.local'),
					'SECRET=local',
					'utf8',
				);
				await writeFile(
					join(directory, '.env.example'),
					'SECRET=example',
					'utf8',
				);

				await expect(
					fileSystem.listFiles({ maxEntries: 10 }),
				).resolves.toEqual({
					files: ['.env.example'],
					truncated: false,
				});
			} finally {
				await cleanup();
			}
		});

		test('reports truncation only when more files exist', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await writeFile(join(directory, 'a.ts'), 'a', 'utf8');
				await writeFile(join(directory, 'b.ts'), 'b', 'utf8');

				await expect(
					fileSystem.listFiles({ maxEntries: 2 }),
				).resolves.toEqual({
					files: ['a.ts', 'b.ts'],
					truncated: false,
				});

				await writeFile(join(directory, 'c.ts'), 'c', 'utf8');

				await expect(
					fileSystem.listFiles({ maxEntries: 2 }),
				).resolves.toEqual({
					files: ['a.ts', 'b.ts'],
					truncated: true,
				});
			} finally {
				await cleanup();
			}
		});

		test('rejects invalid limits and paths outside the workspace', async () => {
			const { fileSystem, cleanup } = await createTempWorkspace();

			try {
				await expect(
					fileSystem.listFiles({ maxEntries: 0 }),
				).rejects.toThrow(
					'Max list entries must be a positive integer.',
				);
				await expect(
					fileSystem.listFiles({
						path: '../outside',
						maxEntries: 10,
					}),
				).rejects.toThrow('Cannot access file outside workspace');
			} finally {
				await cleanup();
			}
		});
	});

	describe('readFile', () => {
		test('reads a UTF-8 file from the workspace', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await mkdir(join(directory, 'src'));
				await writeFile(
					join(directory, 'src', 'file.txt'),
					'zażółć',
					'utf8',
				);

				await expect(
					fileSystem.readFile({
						path: 'src/file.txt',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).resolves.toEqual({
					path: 'src/file.txt',
					content: 'zażółć',
				});
			} finally {
				await cleanup();
			}
		});

		test('rejects protected env files', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await writeFile(
					join(directory, '.env'),
					'SECRET=value',
					'utf8',
				);

				await expect(
					fileSystem.readFile({
						path: '.env',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('Cannot access protected file');
			} finally {
				await cleanup();
			}
		});

		test('rejects relative, absolute, and symlink escapes', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();
			const outsideDirectory = await mkdtemp(
				join(tmpdir(), 'outside-workspace-'),
			);

			try {
				await writeFile(
					join(outsideDirectory, 'secret.txt'),
					'secret',
					'utf8',
				);
				await symlink(
					join(outsideDirectory, 'secret.txt'),
					join(directory, 'link.txt'),
				);

				await expect(
					fileSystem.readFile({
						path: '../outside.txt',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('Cannot access file outside workspace');
				await expect(
					fileSystem.readFile({
						path: join(directory, 'file.txt'),
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow(
					'Workspace file path must be relative.',
				);
				await expect(
					fileSystem.readFile({
						path: 'link.txt',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('Cannot access file outside workspace');
			} finally {
				await cleanup();
				await rm(outsideDirectory, {
					recursive: true,
					force: true,
				});
			}
		});

		test('rejects files above the size limit', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await writeFile(
					join(directory, 'large.txt'),
					'hello',
					'utf8',
				);

				await expect(
					fileSystem.readFile({
						path: 'large.txt',
						maxFileBytes: 3,
					}),
				).rejects.toThrow('File is too large');
			} finally {
				await cleanup();
			}
		});
	});

	describe('writeFile', () => {
		test('writes an existing UTF-8 file', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await writeFile(
					join(directory, 'file.txt'),
					'before',
					'utf8',
				);

				await expect(
					fileSystem.writeFile({
						path: 'file.txt',
						content: 'after',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).resolves.toEqual({
					path: 'file.txt',
					content: 'after',
				});
				await expect(
					readFile(join(directory, 'file.txt'), 'utf8'),
				).resolves.toBe('after');
			} finally {
				await cleanup();
			}
		});

		test('rejects content above the size limit', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await writeFile(
					join(directory, 'file.txt'),
					'short',
					'utf8',
				);

				await expect(
					fileSystem.writeFile({
						path: 'file.txt',
						content: 'long replacement',
						maxFileBytes: 8,
					}),
				).rejects.toThrow('File content is too large');
				await expect(
					readFile(join(directory, 'file.txt'), 'utf8'),
				).resolves.toBe('short');
			} finally {
				await cleanup();
			}
		});
	});

	describe('createFile', () => {
		test('creates a new UTF-8 file in an existing directory', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await mkdir(join(directory, 'src'));

				await expect(
					fileSystem.createFile({
						path: 'src/new-file.ts',
						content: 'export const value = 1;\n',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).resolves.toEqual({
					path: 'src/new-file.ts',
					content: 'export const value = 1;\n',
				});
				await expect(
					readFile(join(directory, 'src', 'new-file.ts'), 'utf8'),
				).resolves.toBe('export const value = 1;\n');
			} finally {
				await cleanup();
			}
		});

		test('does not overwrite an existing file', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();

			try {
				await writeFile(
					join(directory, 'file.txt'),
					'existing',
					'utf8',
				);

				await expect(
					fileSystem.createFile({
						path: 'file.txt',
						content: 'replacement',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('File already exists');
				await expect(
					readFile(join(directory, 'file.txt'), 'utf8'),
				).resolves.toBe('existing');
			} finally {
				await cleanup();
			}
		});

		test('rejects protected paths and paths outside the workspace', async () => {
			const { fileSystem, cleanup } = await createTempWorkspace();

			try {
				await expect(
					fileSystem.createFile({
						path: '.env',
						content: 'SECRET=value',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('Cannot access protected file');
				await expect(
					fileSystem.createFile({
						path: '../outside.txt',
						content: 'outside',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('Cannot access file outside workspace');
			} finally {
				await cleanup();
			}
		});

		test('rejects a parent directory symlink outside the workspace', async () => {
			const { directory, fileSystem, cleanup } =
				await createTempWorkspace();
			const outsideDirectory = await mkdtemp(
				join(tmpdir(), 'outside-workspace-'),
			);

			try {
				await symlink(outsideDirectory, join(directory, 'outside'));

				await expect(
					fileSystem.createFile({
						path: 'outside/file.txt',
						content: 'outside',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('Cannot access file outside workspace');
			} finally {
				await cleanup();
				await rm(outsideDirectory, {
					recursive: true,
					force: true,
				});
			}
		});

		test('rejects content above the size limit', async () => {
			const { fileSystem, cleanup } = await createTempWorkspace();

			try {
				await expect(
					fileSystem.createFile({
						path: 'file.txt',
						content: 'too large',
						maxFileBytes: 3,
					}),
				).rejects.toThrow('File content is too large');
			} finally {
				await cleanup();
			}
		});
	});
});
