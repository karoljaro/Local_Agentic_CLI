import * as fsPromises from 'node:fs/promises';
import { createDeferred } from '@/test-support/createDeferred';
import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test, spyOn } from 'bun:test';

import { createTempDirectory } from '@/test-support/createTempDirectory';
import { NodeWorkspaceFileSystem } from './NodeWorkspaceFileSystem';

const MAX_FILE_BYTES = 1024;

const createTempWorkspace = async (): Promise<{
	directory: string;
	fileSystem: NodeWorkspaceFileSystem;
	cleanup: () => Promise<void>;
}> => {
	const { directory, cleanup } = await createTempDirectory('workspace-file-system-');

	return {
		directory,
		fileSystem: new NodeWorkspaceFileSystem(directory),
		cleanup,
	};
};

describe('NodeWorkspaceFileSystem', () => {
	describe('listFiles', () => {
		test('lists workspace files recursively in path order', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await mkdir(join(directory, 'src', 'nested'), {
					recursive: true,
				});
				await writeFile(join(directory, 'src', 'nested', 'second.ts'), 'second', 'utf8');
				await writeFile(join(directory, 'src', 'first.ts'), 'first', 'utf8');

				await expect(fileSystem.listFiles({ maxEntries: 10 })).resolves.toEqual({
					files: ['src/first.ts', 'src/nested/second.ts'],
					truncated: false,
				});
			} finally {
				await cleanup();
			}
		});

		test('lists files under a relative path', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await mkdir(join(directory, 'src'));
				await mkdir(join(directory, 'tests'));
				await writeFile(join(directory, 'src', 'file.ts'), 'source', 'utf8');
				await writeFile(join(directory, 'tests', 'file.test.ts'), 'test', 'utf8');

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
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await mkdir(join(directory, '.agent'));
				await mkdir(join(directory, '.git'));
				await mkdir(join(directory, 'node_modules', 'pkg'), {
					recursive: true,
				});
				await writeFile(join(directory, '.agent', 'events.jsonl'), 'event', 'utf8');
				await writeFile(join(directory, '.git', 'config'), 'git', 'utf8');
				await writeFile(join(directory, 'node_modules', 'pkg', 'index.js'), 'module', 'utf8');
				await writeFile(join(directory, '.env'), 'SECRET=value', 'utf8');
				await writeFile(join(directory, '.env.local'), 'SECRET=local', 'utf8');
				await writeFile(join(directory, '.env.example'), 'SECRET=example', 'utf8');

				await expect(fileSystem.listFiles({ maxEntries: 10 })).resolves.toEqual({
					files: ['.env.example'],
					truncated: false,
				});
			} finally {
				await cleanup();
			}
		});

		test('reports truncation only when more files exist', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, 'a.ts'), 'a', 'utf8');
				await writeFile(join(directory, 'b.ts'), 'b', 'utf8');

				await expect(fileSystem.listFiles({ maxEntries: 2 })).resolves.toEqual({
					files: ['a.ts', 'b.ts'],
					truncated: false,
				});

				await writeFile(join(directory, 'c.ts'), 'c', 'utf8');

				await expect(fileSystem.listFiles({ maxEntries: 2 })).resolves.toEqual({
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
				await expect(fileSystem.listFiles({ maxEntries: 0 })).rejects.toThrow(
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
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await mkdir(join(directory, 'src'));
				await writeFile(join(directory, 'src', 'file.txt'), 'zażółć', 'utf8');

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
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, '.env'), 'SECRET=value', 'utf8');

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
			const { directory, fileSystem, cleanup } = await createTempWorkspace();
			const { directory: outsideDirectory, cleanup: cleanupOutsideDirectory } =
				await createTempDirectory('outside-workspace-');

			try {
				await writeFile(join(outsideDirectory, 'secret.txt'), 'secret', 'utf8');
				await symlink(join(outsideDirectory, 'secret.txt'), join(directory, 'link.txt'));

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
				).rejects.toThrow('Workspace file path must be relative.');
				await expect(
					fileSystem.readFile({
						path: 'link.txt',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('Cannot access file outside workspace');
			} finally {
				await cleanup();
				await cleanupOutsideDirectory();
			}
		});

		test('rejects files above the size limit', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, 'large.txt'), 'hello', 'utf8');

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
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, 'file.txt'), 'before', 'utf8');

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
				await expect(readFile(join(directory, 'file.txt'), 'utf8')).resolves.toBe('after');
			} finally {
				await cleanup();
			}
		});

		test('rejects a stale write when expected content no longer matches', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, 'file.txt'), 'before', 'utf8');
				await writeFile(join(directory, 'file.txt'), 'changed elsewhere', 'utf8');

				await expect(
					fileSystem.writeFile({
						path: 'file.txt',
						content: 'after',
						expectedContent: 'before',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('File changed since it was read');
				await expect(readFile(join(directory, 'file.txt'), 'utf8')).resolves.toBe(
					'changed elsewhere',
				);
			} finally {
				await cleanup();
			}
		});

		test('does not leave temporary files after writing', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, 'file.txt'), 'before', 'utf8');

				await fileSystem.writeFile({
					path: 'file.txt',
					content: 'after',
					maxFileBytes: MAX_FILE_BYTES,
				});

				const entries = await readdir(directory);

				expect(entries).toEqual(['file.txt']);
			} finally {
				await cleanup();
			}
		});

		test('rejects content above the size limit', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, 'file.txt'), 'short', 'utf8');

				await expect(
					fileSystem.writeFile({
						path: 'file.txt',
						content: 'long replacement',
						maxFileBytes: 8,
					}),
				).rejects.toThrow('File content is too large');
				await expect(readFile(join(directory, 'file.txt'), 'utf8')).resolves.toBe('short');
			} finally {
				await cleanup();
			}
		});
	});

	describe('createFile', () => {
		test('creates a new UTF-8 file in an existing directory', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

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
				await expect(readFile(join(directory, 'src', 'new-file.ts'), 'utf8')).resolves.toBe(
					'export const value = 1;\n',
				);
			} finally {
				await cleanup();
			}
		});

		test('does not overwrite an existing file', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, 'file.txt'), 'existing', 'utf8');

				await expect(
					fileSystem.createFile({
						path: 'file.txt',
						content: 'replacement',
						maxFileBytes: MAX_FILE_BYTES,
					}),
				).rejects.toThrow('File already exists');
				await expect(readFile(join(directory, 'file.txt'), 'utf8')).resolves.toBe('existing');
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
			const { directory, fileSystem, cleanup } = await createTempWorkspace();
			const { directory: outsideDirectory, cleanup: cleanupOutsideDirectory } =
				await createTempDirectory('outside-workspace-');

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
				await cleanupOutsideDirectory();
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

describe('NodeWorkspaceFileSystem cooperative cancellation', () => {
	for (const operation of ['list', 'read', 'write', 'create'] as const) {
		test(`already-aborted ${operation} performs no filesystem work`, async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();
			try {
				await writeFile(join(directory, 'existing'), 'original');
				const controller = new AbortController();
				controller.abort('custom reason');
				const options = { signal: controller.signal };
				const promise =
					operation === 'list'
						? fileSystem.listFiles({ maxEntries: 10 }, options)
						: operation === 'read'
							? fileSystem.readFile({ path: 'existing', maxFileBytes: MAX_FILE_BYTES }, options)
							: operation === 'write'
								? fileSystem.writeFile(
										{ path: 'existing', content: 'changed', maxFileBytes: MAX_FILE_BYTES },
										options,
									)
								: fileSystem.createFile(
										{ path: 'new', content: 'created', maxFileBytes: MAX_FILE_BYTES },
										options,
									);
				expect(
					await promise.then(
						() => undefined,
						(error: unknown) => error,
					),
				).toHaveProperty('name', 'AbortError');
				expect(await readFile(join(directory, 'existing'), 'utf8')).toBe('original');
				expect(await readdir(directory)).toEqual(['existing']);
			} finally {
				await cleanup();
			}
		});
	}

	for (const operation of ['write', 'create'] as const) {
		test(`${operation} crosses its safe mutation boundary and finishes after cancellation`, async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();
			const started = createDeferred<void>();
			const finish = createDeferred<void>();
			const controller = new AbortController();
			const originalWrite = fsPromises.writeFile;
			let writeSpy: ReturnType<typeof spyOn> | undefined;
			try {
				await writeFile(join(directory, 'target'), 'original');
				writeSpy = spyOn(fsPromises, 'writeFile').mockImplementation(
					async (...args: Parameters<typeof fsPromises.writeFile>) => {
						await originalWrite(...args);
						started.resolve();
						await finish.promise;
					},
				);
				const promise =
					operation === 'write'
						? fileSystem.writeFile(
								{
									path: 'target',
									content: 'changed',
									maxFileBytes: MAX_FILE_BYTES,
									expectedContent: 'original',
								},
								{ signal: controller.signal },
							)
						: fileSystem.createFile(
								{ path: 'created', content: 'changed', maxFileBytes: MAX_FILE_BYTES },
								{ signal: controller.signal },
							);
				let settled = false;
				void promise.then(() => {
					settled = true;
				});
				await started.promise;
				controller.abort();
				await Promise.resolve();
				expect(settled).toBe(false);
				finish.resolve();
				await expect(promise).resolves.toMatchObject({ content: 'changed' });
				const target = operation === 'write' ? 'target' : 'created';
				expect(await readFile(join(directory, target), 'utf8')).toBe('changed');
				expect((await readdir(directory)).filter((name) => name.startsWith('.tmp-'))).toEqual([]);
			} finally {
				finish.resolve();
				writeSpy?.mockRestore();
				await cleanup();
			}
		});
	}

	test('rename failure during cancellation preserves the cause and removes the temporary file', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const cause = new Error('rename failed');
		const controller = new AbortController();
		await writeFile(join(directory, 'target'), 'original');
		const renameSpy = spyOn(fsPromises, 'rename').mockImplementation(async () => {
			controller.abort();
			throw cause;
		});
		try {
			expect(
				await fileSystem
					.writeFile(
						{
							path: 'target',
							content: 'changed',
							maxFileBytes: MAX_FILE_BYTES,
							expectedContent: 'original',
						},
						{ signal: controller.signal },
					)
					.then(
						() => undefined,
						(error: unknown) => error,
					),
			).toBe(cause);
			expect(await readFile(join(directory, 'target'), 'utf8')).toBe('original');
			expect(await readdir(directory)).toEqual(['target']);
		} finally {
			renameSpy.mockRestore();
			await cleanup();
		}
	});

	test('cancellation during listing stops before entering another directory', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const controller = new AbortController();
		const originalRead = fsPromises.readdir;
		await mkdir(join(directory, 'nested'));
		await writeFile(join(directory, 'nested', 'file'), 'content');
		let reads = 0;
		const readSpy = spyOn(fsPromises, 'readdir').mockImplementation((async (
			...args: Parameters<typeof fsPromises.readdir>
		) => {
			reads++;
			const result = await originalRead(...args);
			controller.abort();
			return result;
		}) as typeof fsPromises.readdir);
		try {
			expect(
				await fileSystem.listFiles({ maxEntries: 10 }, { signal: controller.signal }).then(
					() => undefined,
					(error: unknown) => error,
				),
			).toHaveProperty('name', 'AbortError');
			expect(reads).toBe(1);
		} finally {
			readSpy.mockRestore();
			await cleanup();
		}
	});
});
