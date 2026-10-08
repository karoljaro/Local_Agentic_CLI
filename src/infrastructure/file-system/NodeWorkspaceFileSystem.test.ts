import * as fsPromises from 'node:fs/promises';
import { createDeferred } from '@/test-support/createDeferred';
import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { describe, expect, test, spyOn } from 'bun:test';

import { createTempDirectory } from '@/test-support/createTempDirectory';
import { NodeWorkspaceFileSystem } from './NodeWorkspaceFileSystem';
import {
	PROTECTED_DIRECTORIES,
	SAFE_ENV_BASENAMES,
	isProtectedFilePath,
	isProtectedDirectoryPath,
} from './workspacePolicy';

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
	describe('findFiles', () => {
		test('lists workspace files recursively in path order', async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();

			try {
				await mkdir(join(directory, 'src', 'nested'), {
					recursive: true,
				});
				await writeFile(join(directory, 'src', 'nested', 'second.ts'), 'second', 'utf8');
				await writeFile(join(directory, 'src', 'first.ts'), 'first', 'utf8');

				await expect(fileSystem.findFiles({ pattern: '**', maxEntries: 10 })).resolves.toEqual({
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
					fileSystem.findFiles({ pattern: '**', path: 'src', maxEntries: 10 }),
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

				await expect(fileSystem.findFiles({ pattern: '**', maxEntries: 10 })).resolves.toEqual({
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

				await expect(fileSystem.findFiles({ pattern: '**', maxEntries: 2 })).resolves.toEqual({
					files: ['a.ts', 'b.ts'],
					truncated: false,
				});

				await writeFile(join(directory, 'c.ts'), 'c', 'utf8');

				await expect(fileSystem.findFiles({ pattern: '**', maxEntries: 2 })).resolves.toEqual({
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
				await expect(fileSystem.findFiles({ pattern: '**', maxEntries: 0 })).rejects.toThrow(
					'Max list entries must be a positive integer.',
				);
				await expect(
					fileSystem.findFiles({ pattern: '**', path: '../outside', maxEntries: 10 }),
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

describe('NodeWorkspaceFileSystem workspace policy', () => {
	test('shares exact readonly policy tuples while derived Sets remain independent', () => {
		// A mutable array declaration makes these assignments fail typecheck.
		const protectedValuesAreReadonly: typeof PROTECTED_DIRECTORIES extends string[] ? false : true =
			true;
		const envValuesAreReadonly: typeof SAFE_ENV_BASENAMES extends string[] ? false : true = true;
		expect(protectedValuesAreReadonly).toBe(true);
		expect(envValuesAreReadonly).toBe(true);
		expect(PROTECTED_DIRECTORIES).toEqual(['node_modules', '.git', '.agent']);
		expect(SAFE_ENV_BASENAMES).toEqual(['.env.development', '.env.dev', '.env.example']);
		const localDirectories = new Set<string>(PROTECTED_DIRECTORIES);
		const localEnvFiles = new Set<string>(SAFE_ENV_BASENAMES);
		localDirectories.clear();
		localEnvFiles.add('.env.secret');
		expect(new Set(PROTECTED_DIRECTORIES).size).toBe(3);
		expect(new Set<string>(SAFE_ENV_BASENAMES).has('.env.secret')).toBe(false);
	});

	const expectProtectedFile = async (
		fileSystem: NodeWorkspaceFileSystem,
		path: string,
		newPath = path,
	): Promise<void> => {
		await expect(fileSystem.readFile({ path, maxFileBytes: MAX_FILE_BYTES })).rejects.toThrow(
			'Cannot access protected file',
		);
		await expect(
			fileSystem.writeFile({ path, content: 'changed', maxFileBytes: MAX_FILE_BYTES }),
		).rejects.toThrow('Cannot access protected file');
		await expect(
			fileSystem.createFile({ path: newPath, content: 'created', maxFileBytes: MAX_FILE_BYTES }),
		).rejects.toThrow('Cannot access protected file');
		await expect(fileSystem.findFiles({ pattern: '**', path, maxEntries: 10 })).resolves.toEqual({
			files: [],
			truncated: false,
		});
	};

	for (const directoryPath of ['project/node_modules', 'nested/.git', 'foo/bar/.agent']) {
		test(`blocks read/write/create and skips nested ${directoryPath}`, async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();
			try {
				await mkdir(join(directory, directoryPath), { recursive: true });
				const path = `${directoryPath}/.env.example`;
				await writeFile(join(directory, path), 'original');
				await writeFile(join(directory, 'visible.ts'), 'visible');
				// Normalization and a safe basename cannot bypass a protected directory segment.
				await expectProtectedFile(fileSystem, path.replace('/', '/./'), `${directoryPath}/new.ts`);
				await expect(
					fileSystem.findFiles({ pattern: '**', path: directoryPath, maxEntries: 10 }),
				).resolves.toEqual({
					files: [],
					truncated: false,
				});
				await expect(fileSystem.findFiles({ pattern: '**', maxEntries: 10 })).resolves.toEqual({
					files: ['visible.ts'],
					truncated: false,
				});
				expect(await readFile(join(directory, path), 'utf8')).toBe('original');
				expect(await readdir(join(directory, directoryPath))).toEqual(['.env.example']);
			} finally {
				await cleanup();
			}
		});
	}

	for (const prefix of ['', 'nested/']) {
		for (const basename of ['.env.dev', '.env.development', '.env.example']) {
			test(`allows exact safe env file ${prefix}${basename}`, async () => {
				const { directory, fileSystem, cleanup } = await createTempWorkspace();
				const path = `${prefix}${basename}`;
				try {
					await mkdir(dirname(join(directory, path)), { recursive: true });
					await expect(
						fileSystem.createFile({ path, content: 'original', maxFileBytes: MAX_FILE_BYTES }),
					).resolves.toEqual({ path, content: 'original' });
					await expect(
						fileSystem.readFile({ path, maxFileBytes: MAX_FILE_BYTES }),
					).resolves.toEqual({
						path,
						content: 'original',
					});
					await expect(
						fileSystem.writeFile({
							path,
							content: 'updated',
							expectedContent: 'original',
							maxFileBytes: MAX_FILE_BYTES,
						}),
					).resolves.toEqual({ path, content: 'updated' });
					for (const listedPath of ['.', path]) {
						await expect(
							fileSystem.findFiles({ pattern: '**', path: listedPath, maxEntries: 10 }),
						).resolves.toEqual({
							files: [path],
							truncated: false,
						});
					}
					expect(await readFile(join(directory, path), 'utf8')).toBe('updated');
				} finally {
					await cleanup();
				}
			});
		}

		for (const basename of [
			'.env',
			'.env.local',
			'.env.production',
			'.env.secret',
			'.env.private',
		]) {
			test(`protects secret env file ${prefix}${basename}`, async () => {
				const { directory, fileSystem, cleanup } = await createTempWorkspace();
				const path = `${prefix}${basename}`;
				try {
					await mkdir(dirname(join(directory, path)), { recursive: true });
					await writeFile(join(directory, path), 'original');
					await expectProtectedFile(fileSystem, path);
					await expect(fileSystem.findFiles({ pattern: '**', maxEntries: 10 })).resolves.toEqual({
						files: [],
						truncated: false,
					});
					expect(await readFile(join(directory, path), 'utf8')).toBe('original');
				} finally {
					await cleanup();
				}
			});
		}
	}

	for (const basename of ['.env', '.env.local', '.env.dev', '.env.development', '.env.example']) {
		test(`protects .env path segments even when directory basename is ${basename}`, async () => {
			const { directory, fileSystem, cleanup } = await createTempWorkspace();
			const directoryPath = `nested/${basename}`;
			try {
				await mkdir(join(directory, directoryPath), { recursive: true });
				const path = `${directoryPath}/.env.example`;
				await writeFile(join(directory, path), 'original');
				await expectProtectedFile(fileSystem, path, `${directoryPath}/new.ts`);
				await expect(
					fileSystem.findFiles({ pattern: '**', path: directoryPath, maxEntries: 10 }),
				).resolves.toEqual({
					files: [],
					truncated: false,
				});
				await expect(fileSystem.findFiles({ pattern: '**', maxEntries: 10 })).resolves.toEqual({
					files: [],
					truncated: false,
				});
				expect(await readFile(join(directory, path), 'utf8')).toBe('original');
				expect(await readdir(join(directory, directoryPath))).toEqual(['.env.example']);
			} finally {
				await cleanup();
			}
		});
	}
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
						? fileSystem.findFiles({ pattern: '**', maxEntries: 10 }, options)
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
				await fileSystem
					.findFiles({ pattern: '**', maxEntries: 10 }, { signal: controller.signal })
					.then(
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

describe('Phase 14 directory and filename discovery', () => {
	test('lists one level cheaply, distinguishes empty directories, and bounds requested depth', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await mkdir(join(directory, 'src', 'nested', 'deep'), { recursive: true });
			await mkdir(join(directory, 'empty'));
			await writeFile(join(directory, 'root.ts'), 'root');
			await writeFile(join(directory, 'src', 'module.ts'), 'module');
			await writeFile(join(directory, 'src', 'nested', 'deep', 'hidden.ts'), 'hidden');
			await expect(fileSystem.listDirectory({ depth: 1, maxEntries: 10 })).resolves.toEqual({
				path: '.',
				entries: [
					{ path: 'empty', type: 'directory' },
					{ path: 'root.ts', type: 'file' },
					{ path: 'src', type: 'directory' },
				],
				truncated: false,
			});
			await expect(
				fileSystem.listDirectory({ path: 'src', depth: 2, maxEntries: 10 }),
			).resolves.toEqual({
				path: 'src',
				entries: [
					{ path: 'src/module.ts', type: 'file' },
					{ path: 'src/nested', type: 'directory' },
					{ path: 'src/nested/deep', type: 'directory' },
				],
				truncated: false,
			});
			await expect(
				fileSystem.listDirectory({ path: 'root.ts', depth: 1, maxEntries: 10 }),
			).rejects.toThrow('Path is not a directory');
			await expect(fileSystem.listDirectory({ depth: 0, maxEntries: 10 })).rejects.toThrow(
				'Directory depth',
			);
			await expect(fileSystem.listDirectory({ depth: 6, maxEntries: 10 })).rejects.toThrow(
				'Directory depth',
			);
			await expect(fileSystem.listDirectory({ depth: 1, maxEntries: 0 })).rejects.toThrow(
				'Max list entries',
			);
		} finally {
			await cleanup();
		}
	});

	test('lists exactly the requested limit without a false truncation flag', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await writeFile(join(directory, 'a'), 'a');
			await mkdir(join(directory, 'b'));
			await expect(fileSystem.listDirectory({ depth: 1, maxEntries: 2 })).resolves.toMatchObject({
				truncated: false,
			});
			await writeFile(join(directory, 'c'), 'c');
			await expect(fileSystem.listDirectory({ depth: 1, maxEntries: 2 })).resolves.toMatchObject({
				entries: [
					{ path: 'a', type: 'file' },
					{ path: 'b', type: 'directory' },
				],
				truncated: true,
			});
		} finally {
			await cleanup();
		}
	});

	test('matches basenames or scoped paths with literal punctuation and simple wildcards', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			for (const path of [
				'src/foo.ts',
				'src/nested/foo1.ts',
				'src/nested/foo2.js',
				'src/a(foo).ts',
				'other/foo.ts',
			]) {
				await mkdir(dirname(join(directory, path)), { recursive: true });
				await writeFile(join(directory, path), 'fixture');
			}
			for (const [pattern, path, files] of [
				['foo*', 'src', ['src/foo.ts', 'src/nested/foo1.ts', 'src/nested/foo2.js']],
				['**/foo?.ts', 'src', ['src/nested/foo1.ts']],
				['**/foo.ts', 'src', ['src/foo.ts']],
				['nested/*.ts', 'src', ['src/nested/foo1.ts']],
				['a(foo).ts', 'src', ['src/a(foo).ts']],
				['*/foo.ts', '.', ['other/foo.ts', 'src/foo.ts']],
			] as const) {
				await expect(fileSystem.findFiles({ pattern, path, maxEntries: 20 })).resolves.toEqual({
					files: [...files],
					truncated: false,
				});
			}
			for (const pattern of [
				'[ab].ts',
				'{a,b}.ts',
				'../*.ts',
				'/foo',
				'C:/foo',
				'\\foo',
				'*'.repeat(201),
			]) {
				await expect(fileSystem.findFiles({ pattern, maxEntries: 10 })).rejects.toThrow(
					'File pattern',
				);
			}
		} finally {
			await cleanup();
		}
	});

	test('glob matching does not backtrack on many wildcards or globstar directories', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await mkdir(join(directory, ...Array.from({ length: 20 }, () => 'a')), { recursive: true });
			await writeFile(
				join(directory, ...Array.from({ length: 20 }, () => 'a'), 'a'.repeat(80)),
				'fixture',
			);
			for (const pattern of [
				'*'.repeat(40) + 'z',
				'*a'.repeat(40) + '*z',
				'**/'.repeat(60) + 'missing',
			]) {
				await expect(fileSystem.findFiles({ pattern, maxEntries: 10 })).resolves.toEqual({
					files: [],
					truncated: false,
				});
			}
			await expect(
				fileSystem.findFiles({ pattern: '**/'.repeat(60) + '*', maxEntries: 10 }),
			).resolves.toMatchObject({
				files: [`${Array.from({ length: 20 }, () => 'a').join('/')}/${'a'.repeat(80)}`],
			});
		} finally {
			await cleanup();
		}
	});

	test('work and depth budgets report an incomplete traversal even with no file matches', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const originalRead = fsPromises.readdir;
		let readSpy: ReturnType<typeof spyOn> | undefined;
		try {
			readSpy = spyOn(fsPromises, 'readdir').mockImplementation((async (
				...args: Parameters<typeof fsPromises.readdir>
			) => {
				if (args[0] !== directory) return originalRead(...args);
				return Array.from({ length: 10_001 }, (_, index) => ({
					name: `.env.secret-${index}`,
					isFile: () => true,
					isDirectory: () => false,
				}));
			}) as typeof fsPromises.readdir);
			await expect(fileSystem.findFiles({ pattern: '*.ts', maxEntries: 10 })).resolves.toEqual({
				files: [],
				truncated: true,
			});
			readSpy.mockRestore();
			readSpy = undefined;
			const path = `${Array.from({ length: 101 }, () => 'd').join('/')}/deep.ts`;
			await mkdir(dirname(join(directory, path)), { recursive: true });
			await writeFile(join(directory, path), 'deep');
			await expect(fileSystem.findFiles({ pattern: '*.ts', maxEntries: 10 })).resolves.toEqual({
				files: [],
				truncated: true,
			});
		} finally {
			readSpy?.mockRestore();
			await cleanup();
		}
	});

	test('omits symlink cycles, safe aliases, escapes and protected directory entries', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const outside = await createTempDirectory('phase14-outside-');
		try {
			await mkdir(join(directory, 'visible'));
			await writeFile(join(directory, 'visible', 'file.ts'), 'visible');
			await symlink(directory, join(directory, 'cycle'));
			await symlink(join(directory, 'visible'), join(directory, 'alias'));
			await symlink(outside.directory, join(directory, 'escape'));
			await mkdir(join(directory, '.env.example'));
			await mkdir(join(directory, '.git'));
			await expect(fileSystem.listDirectory({ depth: 5, maxEntries: 20 })).resolves.toEqual({
				path: '.',
				entries: [
					{ path: 'visible', type: 'directory' },
					{ path: 'visible/file.ts', type: 'file' },
				],
				truncated: false,
			});
			await expect(fileSystem.findFiles({ pattern: '**', maxEntries: 20 })).resolves.toEqual({
				files: ['visible/file.ts'],
				truncated: false,
			});
		} finally {
			await cleanup();
			await outside.cleanup();
		}
	});
});

describe('Phase 14 nested creation and mutation safety', () => {
	test.each([
		'parent/file.ts',
		'src/features/auth/services/AuthService.ts',
	])('creates every missing parent for %s in one operation', async (path) => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await expect(
				fileSystem.createFile({ path, content: 'source', maxFileBytes: MAX_FILE_BYTES }),
			).resolves.toEqual({ path, content: 'source' });
			await expect(readFile(join(directory, path), 'utf8')).resolves.toBe('source');
			let parent = dirname(join(directory, path));
			while (parent !== directory) {
				expect((await fsPromises.stat(parent)).isDirectory()).toBe(true);
				parent = dirname(parent);
			}
			await expect(readdir(dirname(join(directory, path)))).resolves.toEqual([
				path.split('/').at(-1) ?? '',
			]);
		} finally {
			await cleanup();
		}
	});

	test('preserves existing parents and accepts safe internal symlink parents canonically', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await mkdir(join(directory, 'real'));
			await writeFile(join(directory, 'real', 'existing'), 'original');
			await symlink(join(directory, 'real'), join(directory, 'alias'));
			await expect(
				fileSystem.createFile({
					path: 'alias/new/deep/file',
					content: 'created',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).resolves.toEqual({ path: 'real/new/deep/file', content: 'created' });
			await expect(readFile(join(directory, 'real', 'existing'), 'utf8')).resolves.toBe('original');
		} finally {
			await cleanup();
		}
	});

	test('rejects file parents, existing targets, oversized content and portable absolute/escape paths', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await writeFile(join(directory, 'parent'), 'original');
			await expect(
				fileSystem.createFile({
					path: 'parent/deep/file',
					content: 'created',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).rejects.toThrow('Parent is not a directory');
			await expect(
				fileSystem.createFile({ path: 'parent', content: 'created', maxFileBytes: MAX_FILE_BYTES }),
			).rejects.toThrow('File already exists');
			await expect(
				fileSystem.createFile({
					path: 'not/created/file',
					content: 'long content',
					maxFileBytes: 1,
				}),
			).rejects.toThrow('content is too large');
			for (const path of [
				'/absolute/file',
				'C:/outside/file',
				'C:relative-drive',
				'\\\\server\\share',
				'../outside/file',
				'inside/../../outside/file',
				'name\0bad',
			]) {
				await expect(
					fileSystem.createFile({ path, content: 'created', maxFileBytes: MAX_FILE_BYTES }),
				).rejects.toThrow();
			}
			await expect(readdir(directory)).resolves.toEqual(['parent']);
			await expect(
				fileSystem.createFile({
					path: '..notes/file',
					content: 'valid',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).resolves.toMatchObject({ path: '..notes/file' });
		} finally {
			await cleanup();
		}
	});

	test.each([
		'.git',
		'node_modules',
		'.agent',
		'.env',
		'.env.dev',
		'.env.example',
	])('rejects missing protected parent %s before creating any directories', async (segment) => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await writeFile(join(directory, 'source'), 'original');
			const path = `new/${segment}/deep/file`;
			await expect(
				fileSystem.createFile({ path, content: 'created', maxFileBytes: MAX_FILE_BYTES }),
			).rejects.toThrow('protected');
			await expect(fileSystem.moveFile({ source: 'source', destination: path })).rejects.toThrow(
				'protected',
			);
			await expect(fileSystem.deletePath({ path })).rejects.toThrow('protected');
			await expect(
				fileSystem.moveFile({ source: path, destination: 'destination' }),
			).rejects.toThrow('protected');
			await expect(readdir(directory)).resolves.toEqual(['source']);
		} finally {
			await cleanup();
		}
	});

	test('does not normalize away protected raw segments or follow protected-name aliases', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await mkdir(join(directory, '.git'));
			await writeFile(join(directory, 'visible'), 'original');
			await symlink(join(directory, 'visible'), join(directory, '.git', 'alias'));
			await symlink(join(directory, 'visible'), join(directory, '.env.secret'));
			await symlink(join(directory, '.git'), join(directory, 'alias'));
			for (const path of ['.git/../visible', '.git/alias', '.env.secret']) {
				await expect(fileSystem.readFile({ path, maxFileBytes: MAX_FILE_BYTES })).rejects.toThrow(
					'protected',
				);
				await expect(
					fileSystem.writeFile({ path, content: 'changed', maxFileBytes: MAX_FILE_BYTES }),
				).rejects.toThrow('protected');
				await expect(fileSystem.deletePath({ path })).rejects.toThrow('protected');
			}
			await expect(
				fileSystem.createFile({
					path: '.git/../created/deep/file',
					content: 'created',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).rejects.toThrow('protected');
			await expect(
				fileSystem.createFile({
					path: 'alias/new/file',
					content: 'created',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).rejects.toThrow('protected');
			await expect(
				fileSystem.findFiles({ path: '.git/alias', pattern: '*', maxEntries: 10 }),
			).resolves.toEqual({ files: [], truncated: false });
			await expect(readFile(join(directory, 'visible'), 'utf8')).resolves.toBe('original');
			await expect(readdir(join(directory, '.git'))).resolves.toEqual(['alias']);
		} finally {
			await cleanup();
		}
	});

	test.each([
		'.env.dev',
		'.env.development',
		'.env.example',
	])('safe env basename %s never permits an existing directory', async (name) => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await mkdir(join(directory, name));
			await expect(
				fileSystem.createFile({ path: name, content: 'created', maxFileBytes: MAX_FILE_BYTES }),
			).rejects.toThrow('protected directory');
			await expect(fileSystem.deletePath({ path: name })).rejects.toThrow('protected directory');
			await expect(
				fileSystem.createFile({
					path: `new/${name}`,
					content: 'allowed',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).resolves.toMatchObject({ path: `new/${name}` });
		} finally {
			await cleanup();
		}
	});

	test('nested create cancellation between mkdir steps leaves only completed empty parents', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const controller = new AbortController();
		const originalMkdir = fsPromises.mkdir;
		const mkdirSpy = spyOn(fsPromises, 'mkdir').mockImplementation((async (
			...args: Parameters<typeof fsPromises.mkdir>
		) => {
			const result = await originalMkdir(...args);
			controller.abort();
			return result;
		}) as typeof fsPromises.mkdir);
		try {
			const error = await fileSystem
				.createFile(
					{ path: 'one/two/three/file', content: 'created', maxFileBytes: MAX_FILE_BYTES },
					{ signal: controller.signal },
				)
				.catch((cause: unknown) => cause);
			expect(error).toHaveProperty('name', 'AbortError');
			await expect(readdir(directory)).resolves.toEqual(['one']);
			await expect(readdir(join(directory, 'one'))).resolves.toEqual([]);
		} finally {
			mkdirSpy.mockRestore();
			await cleanup();
		}
	});

	test('failed temp write leaves no partial target or temp file; empty new parents remain', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const cause = new Error('injected write failure');
		const originalWrite = fsPromises.writeFile;
		const writeSpy = spyOn(fsPromises, 'writeFile').mockImplementation(
			async (...args: Parameters<typeof fsPromises.writeFile>) => {
				await originalWrite(args[0], 'partial');
				throw cause;
			},
		);
		try {
			const result = await fileSystem
				.createFile({ path: 'one/two/file', content: 'complete', maxFileBytes: MAX_FILE_BYTES })
				.catch((error: unknown) => error);
			expect(result).toBe(cause);
			await expect(readdir(join(directory, 'one', 'two'))).resolves.toEqual([]);
		} finally {
			writeSpy.mockRestore();
			await cleanup();
		}
	});

	test('exclusive create publication rejects a target appearing after preflight without overwriting it', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const originalLink = fsPromises.link;
		const linkSpy = spyOn(fsPromises, 'link').mockImplementation(async (source, destination) => {
			await writeFile(destination, 'concurrent');
			return originalLink(source, destination);
		});
		try {
			await expect(
				fileSystem.createFile({
					path: 'nested/file',
					content: 'created',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).rejects.toThrow('File already exists');
			await expect(readFile(join(directory, 'nested', 'file'), 'utf8')).resolves.toBe('concurrent');
			await expect(readdir(join(directory, 'nested'))).resolves.toEqual(['file']);
		} finally {
			linkSpy.mockRestore();
			await cleanup();
		}
	});

	test('filesystem errors contain relative paths and preserve non-native error causes', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		let readSpy: ReturnType<typeof spyOn> | undefined;
		let writeSpy: ReturnType<typeof spyOn> | undefined;
		try {
			await expect(
				fileSystem.readFile({ path: 'missing', maxFileBytes: MAX_FILE_BYTES }),
			).rejects.toThrow('Path not found: missing');
			readSpy = spyOn(fsPromises, 'readdir').mockRejectedValue(
				Object.assign(new Error(`denied ${directory}`), { code: 'EACCES' }),
			);
			await expect(
				fileSystem.listDirectory({ path: '.', depth: 1, maxEntries: 10 }),
			).rejects.toThrow('Permission denied: .');
			readSpy.mockRestore();
			readSpy = undefined;
			writeSpy = spyOn(fsPromises, 'writeFile').mockRejectedValue(
				Object.assign(new Error(`full ${directory}`), { code: 'ENOSPC' }),
			);
			await expect(
				fileSystem.createFile({
					path: 'nested/file',
					content: 'created',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).rejects.toThrow('Filesystem operation failed (ENOSPC): nested/file');
			await expect(readdir(join(directory, 'nested'))).resolves.toEqual([]);
		} finally {
			readSpy?.mockRestore();
			writeSpy?.mockRestore();
			await cleanup();
		}
	});
});

describe('Phase 14 bounded move and delete', () => {
	test('moves a regular file into new parents with the same contents and mode', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await writeFile(join(directory, 'old.ts'), 'original', { mode: 0o640 });
			await expect(
				fileSystem.moveFile({ source: './old.ts', destination: 'new/deep/renamed.ts' }),
			).resolves.toEqual({ source: 'old.ts', destination: 'new/deep/renamed.ts', moved: true });
			await expect(readFile(join(directory, 'new', 'deep', 'renamed.ts'), 'utf8')).resolves.toBe(
				'original',
			);
			await expect(fsPromises.stat(join(directory, 'old.ts'))).rejects.toThrow();
			if (process.platform !== 'win32')
				expect(
					(await fsPromises.stat(join(directory, 'new', 'deep', 'renamed.ts'))).mode & 0o777,
				).toBe(0o640);
		} finally {
			await cleanup();
		}
	});

	test('rejects existing destinations and directory sources without altering either side', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await writeFile(join(directory, 'source'), 'source');
			await writeFile(join(directory, 'target'), 'target');
			await mkdir(join(directory, 'empty'));
			await mkdir(join(directory, 'nested', '.git'), { recursive: true });
			await writeFile(join(directory, 'nested', '.git', 'config'), 'protected');
			for (const destination of ['target', 'source', 'empty'])
				await expect(fileSystem.moveFile({ source: 'source', destination })).rejects.toThrow(
					'File already exists',
				);
			for (const source of ['.', 'empty', 'nested'])
				await expect(fileSystem.moveFile({ source, destination: 'new/deep/file' })).rejects.toThrow(
					'not a regular file',
				);
			await expect(readFile(join(directory, 'source'), 'utf8')).resolves.toBe('source');
			await expect(readFile(join(directory, 'target'), 'utf8')).resolves.toBe('target');
			await expect(fsPromises.stat(join(directory, 'new'))).rejects.toThrow();
			await expect(readFile(join(directory, 'nested', '.git', 'config'), 'utf8')).resolves.toBe(
				'protected',
			);
		} finally {
			await cleanup();
		}
	});

	test('rejects source and destination symlinks in every path segment, including safe workspace aliases', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const outside = await createTempDirectory('phase14-outside-');
		try {
			await mkdir(join(directory, 'real'));
			await writeFile(join(directory, 'real', 'source'), 'original');
			await writeFile(join(outside.directory, 'outside'), 'outside');
			await symlink(join(directory, 'real'), join(directory, 'alias'));
			await symlink(join(directory, 'real', 'source'), join(directory, 'link'));
			await symlink(outside.directory, join(directory, 'escape'));
			for (const source of ['alias/source', 'link', 'escape/outside']) {
				await expect(fileSystem.moveFile({ source, destination: 'destination' })).rejects.toThrow(
					'Symbolic links',
				);
				await expect(fileSystem.deletePath({ path: source })).rejects.toThrow('Symbolic links');
			}
			for (const destination of ['alias/deep/destination', 'link', 'escape/deep/destination'])
				await expect(fileSystem.moveFile({ source: 'real/source', destination })).rejects.toThrow(
					'Symbolic links',
				);
			await expect(readFile(join(directory, 'real', 'source'), 'utf8')).resolves.toBe('original');
			await expect(readdir(outside.directory)).resolves.toEqual(['outside']);
			await expect(readdir(join(directory, 'real'))).resolves.toEqual(['source']);
		} finally {
			await cleanup();
			await outside.cleanup();
		}
	});

	test('move publication does not overwrite a concurrently created destination', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const originalLink = fsPromises.link;
		let linkSpy: ReturnType<typeof spyOn> | undefined;
		try {
			await writeFile(join(directory, 'source'), 'source');
			linkSpy = spyOn(fsPromises, 'link').mockImplementation(async (source, destination) => {
				await writeFile(destination, 'concurrent');
				return originalLink(source, destination);
			});
			await expect(
				fileSystem.moveFile({ source: 'source', destination: 'new/deep/destination' }),
			).rejects.toThrow('File already exists');
			await expect(readFile(join(directory, 'source'), 'utf8')).resolves.toBe('source');
			await expect(readFile(join(directory, 'new', 'deep', 'destination'), 'utf8')).resolves.toBe(
				'concurrent',
			);
		} finally {
			linkSpy?.mockRestore();
			await cleanup();
		}
	});

	test('move succeeds when the linked source is already removed concurrently', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const originalUnlink = fsPromises.unlink;
		let unlinkSpy: ReturnType<typeof spyOn> | undefined;
		try {
			await writeFile(join(directory, 'source'), 'original');
			unlinkSpy = spyOn(fsPromises, 'unlink').mockImplementation(async (path) => {
				await originalUnlink(path);
				return originalUnlink(path);
			});
			await expect(
				fileSystem.moveFile({ source: 'source', destination: 'destination' }),
			).resolves.toEqual({ source: 'source', destination: 'destination', moved: true });
			expect(await readFile(join(directory, 'destination'), 'utf8')).toBe('original');
			await expect(fsPromises.stat(join(directory, 'source'))).rejects.toHaveProperty(
				'code',
				'ENOENT',
			);
		} finally {
			unlinkSpy?.mockRestore();
			await cleanup();
		}
	});

	test('move source removal failure identifies both paths for checking', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		let unlinkSpy: ReturnType<typeof spyOn> | undefined;
		try {
			await writeFile(join(directory, 'source'), 'original');
			unlinkSpy = spyOn(fsPromises, 'unlink').mockRejectedValue(
				new Error('injected unlink failure'),
			);
			await expect(
				fileSystem.moveFile({ source: 'source', destination: 'new/deep/destination' }),
			).rejects.toThrow('Check both paths: source -> new/deep/destination');
			await expect(readFile(join(directory, 'source'), 'utf8')).resolves.toBe('original');
			await expect(readFile(join(directory, 'new', 'deep', 'destination'), 'utf8')).resolves.toBe(
				'original',
			);
		} finally {
			unlinkSpy?.mockRestore();
			await cleanup();
		}
	});

	test('deletes exactly one regular file or empty directory and rejects roots/nonempty trees', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await mkdir(join(directory, 'empty'));
			await mkdir(join(directory, 'nonempty', '.git'), { recursive: true });
			await writeFile(join(directory, 'nonempty', '.git', 'config'), 'protected');
			await writeFile(join(directory, 'file'), 'file');
			await expect(fileSystem.deletePath({ path: 'file' })).resolves.toEqual({
				path: 'file',
				type: 'file',
				deleted: true,
			});
			await expect(fileSystem.deletePath({ path: 'empty/' })).resolves.toEqual({
				path: 'empty',
				type: 'directory',
				deleted: true,
			});
			for (const path of ['.', './', 'nonempty/..'])
				await expect(fileSystem.deletePath({ path })).rejects.toThrow('workspace root');
			await expect(fileSystem.deletePath({ path: 'nonempty' })).rejects.toThrow(
				'Directory is not empty',
			);
			await expect(fileSystem.deletePath({ path: 'missing' })).rejects.toThrow('Path not found');
			await expect(readFile(join(directory, 'nonempty', '.git', 'config'), 'utf8')).resolves.toBe(
				'protected',
			);
		} finally {
			await cleanup();
		}
	});

	test.each([
		'move',
		'delete',
	] as const)('pre-aborted %s performs no filesystem mutation', async (operation) => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await writeFile(join(directory, 'source'), 'original');
			const controller = new AbortController();
			controller.abort();
			const options = { signal: controller.signal };
			const result = await (operation === 'move'
				? fileSystem.moveFile({ source: 'source', destination: 'new/deep/file' }, options)
				: fileSystem.deletePath({ path: 'source' }, options)
			).catch((error: unknown) => error);
			expect(result).toHaveProperty('name', 'AbortError');
			await expect(readdir(directory)).resolves.toEqual(['source']);
			await expect(readFile(join(directory, 'source'), 'utf8')).resolves.toBe('original');
		} finally {
			await cleanup();
		}
	});

	test.each([
		'move',
		'delete',
	] as const)('%s finishes truthfully after crossing its mutation boundary during cancellation', async (operation) => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const started = createDeferred<void>();
		const finish = createDeferred<void>();
		const controller = new AbortController();
		let mutationSpy: ReturnType<typeof spyOn> | undefined;
		try {
			await writeFile(join(directory, 'source'), 'original');
			if (operation === 'move') {
				const originalLink = fsPromises.link;
				mutationSpy = spyOn(fsPromises, 'link').mockImplementation(
					async (...args: Parameters<typeof fsPromises.link>) => {
						await originalLink(...args);
						started.resolve();
						await finish.promise;
					},
				);
			} else {
				const originalUnlink = fsPromises.unlink;
				mutationSpy = spyOn(fsPromises, 'unlink').mockImplementation(
					async (...args: Parameters<typeof fsPromises.unlink>) => {
						await originalUnlink(...args);
						started.resolve();
						await finish.promise;
					},
				);
			}
			const promise =
				operation === 'move'
					? fileSystem.moveFile(
							{ source: 'source', destination: 'new/deep/file' },
							{ signal: controller.signal },
						)
					: fileSystem.deletePath({ path: 'source' }, { signal: controller.signal });
			await started.promise;
			controller.abort();
			finish.resolve();
			await expect(promise).resolves.toMatchObject(
				operation === 'move' ? { moved: true } : { deleted: true },
			);
			await expect(fsPromises.stat(join(directory, 'source'))).rejects.toThrow();
			if (operation === 'move')
				await expect(readFile(join(directory, 'new', 'deep', 'file'), 'utf8')).resolves.toBe(
					'original',
				);
		} finally {
			finish.resolve();
			mutationSpy?.mockRestore();
			await cleanup();
		}
	});

	test('rejects trailing separators for file operations while directory deletion accepts them', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await writeFile(join(directory, 'file'), 'original');
			await expect(
				fileSystem.readFile({ path: 'file/', maxFileBytes: MAX_FILE_BYTES }),
			).rejects.toThrow('must not end with /');
			await expect(
				fileSystem.writeFile({ path: 'file/', content: 'changed', maxFileBytes: MAX_FILE_BYTES }),
			).rejects.toThrow('must not end with /');
			await expect(
				fileSystem.createFile({ path: 'new/', content: 'changed', maxFileBytes: MAX_FILE_BYTES }),
			).rejects.toThrow('must not end with /');
			await expect(fileSystem.moveFile({ source: 'file/', destination: 'target' })).rejects.toThrow(
				'must not end with /',
			);
			await expect(fileSystem.moveFile({ source: 'file', destination: 'target/' })).rejects.toThrow(
				'must not end with /',
			);
			await expect(fileSystem.deletePath({ path: 'file/' })).rejects.toThrow('must not end with /');
			await expect(readFile(join(directory, 'file'), 'utf8')).resolves.toBe('original');
		} finally {
			await cleanup();
		}
	});

	test('unicode literal filenames and directory segments match codepoints consistently with ?', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		try {
			await mkdir(join(directory, 'dir😀'));
			await writeFile(join(directory, 'dir😀', 'module😀.ts'), 'fixture');
			for (const pattern of [
				'module😀.ts',
				'module?.ts',
				'dir😀/module😀.ts',
				'dir?/module?.ts',
				'**/module😀.ts',
			]) {
				await expect(fileSystem.findFiles({ pattern, maxEntries: 10 })).resolves.toEqual({
					files: ['dir😀/module😀.ts'],
					truncated: false,
				});
			}
		} finally {
			await cleanup();
		}
	});

	test('Windows policy folds names without changing Linux policy and rejects alternate data streams before IO', async () => {
		const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
		try {
			Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
			expect(isProtectedFilePath('.GIT/file')).toBe(true);
			expect(isProtectedFilePath('NODE_MODULES/file')).toBe(true);
			expect(isProtectedDirectoryPath('.ENV.EXAMPLE')).toBe(true);
			expect(isProtectedFilePath('.ENV.EXAMPLE')).toBe(false);
			expect(isProtectedFilePath('.ENV.SECRET')).toBe(true);
			await expect(
				new NodeWorkspaceFileSystem('/missing-workspace').createFile({
					path: 'file.txt:stream',
					content: 'created',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).rejects.toThrow('alternate data streams');
			Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
			expect(isProtectedFilePath('.GIT/file')).toBe(false);
			expect(isProtectedDirectoryPath('.ENV.EXAMPLE')).toBe(false);
		} finally {
			if (descriptor) Object.defineProperty(process, 'platform', descriptor);
		}
	});

	test('create warns about cleanup remnants after successful publication', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		let unlinkSpy: ReturnType<typeof spyOn> | undefined;
		try {
			unlinkSpy = spyOn(fsPromises, 'unlink').mockRejectedValue(
				new Error('injected temp cleanup failure'),
			);
			const created = await fileSystem.createFile({
				path: 'created',
				content: 'complete',
				maxFileBytes: MAX_FILE_BYTES,
			});
			expect(created).toMatchObject({ path: 'created', content: 'complete' });
			expect(created.warnings).toHaveLength(1);
			expect(created.warnings?.[0]).toStartWith(
				'File created; delete the leftover temporary file: .tmp-created-',
			);
			expect(created.warnings?.[0]).not.toContain(directory);
			await expect(readFile(join(directory, 'created'), 'utf8')).resolves.toBe('complete');
			expect(
				(await readdir(directory)).filter((name) => name.startsWith('.tmp-created-')),
			).toHaveLength(1);
		} finally {
			unlinkSpy?.mockRestore();
			await cleanup();
		}
	});
});

describe('Phase 14 temporary file ownership and failure reporting', () => {
	test.each([
		'create',
		'write',
	] as const)('%s never removes an unowned temporary file after wx collision', async (operation) => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const originalWrite = fsPromises.writeFile;
		let openSpy: ReturnType<typeof spyOn> | undefined;
		let temporary = '';
		try {
			await writeFile(join(directory, 'existing'), 'original');
			openSpy = spyOn(fsPromises, 'open').mockImplementation(
				async (...args: Parameters<typeof fsPromises.open>) => {
					temporary = String(args[0]);
					await originalWrite(temporary, 'unowned collision');
					throw Object.assign(new Error('injected wx collision'), { code: 'EEXIST' });
				},
			);
			const input = {
				path: operation === 'create' ? 'created' : 'existing',
				content: 'changed',
				maxFileBytes: MAX_FILE_BYTES,
			};
			await expect(
				operation === 'create' ? fileSystem.createFile(input) : fileSystem.writeFile(input),
			).rejects.toThrow('Could not reserve a temporary file; retry');
			await expect(readFile(temporary, 'utf8')).resolves.toBe('unowned collision');
			await expect(readFile(join(directory, 'existing'), 'utf8')).resolves.toBe('original');
			if (operation === 'create')
				await expect(fsPromises.stat(join(directory, 'created'))).rejects.toThrow();
		} finally {
			openSpy?.mockRestore();
			await cleanup();
		}
	});

	test.each([
		'create',
		'write',
	] as const)('%s preserves the primary cause and identifies a cleanup remnant after both failures', async (operation) => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const cause = Object.assign(new Error(`disk full at ${directory}/internal`), {
			code: 'ENOSPC',
		});
		const originalWrite = fsPromises.writeFile;
		let writeSpy: ReturnType<typeof spyOn> | undefined;
		let unlinkSpy: ReturnType<typeof spyOn> | undefined;
		try {
			await mkdir(join(directory, 'nested'));
			await writeFile(join(directory, 'nested', 'existing'), 'original');
			writeSpy = spyOn(fsPromises, 'writeFile').mockImplementation(
				async (...args: Parameters<typeof fsPromises.writeFile>) => {
					await originalWrite(args[0], 'partial');
					throw cause;
				},
			);
			unlinkSpy = spyOn(fsPromises, 'unlink').mockRejectedValue(new Error('cleanup failed'));
			const input = {
				path: operation === 'create' ? 'nested/created' : 'nested/existing',
				content: 'changed',
				maxFileBytes: MAX_FILE_BYTES,
			};
			const result = await (operation === 'create'
				? fileSystem.createFile(input)
				: fileSystem.writeFile(input)
			).catch((error: unknown) => error);
			expect(result).toHaveProperty('cause', cause);
			expect(result).toBeInstanceOf(Error);
			const message = result instanceof Error ? result.message : '';
			expect(message).toContain(
				`Filesystem operation failed (ENOSPC): ${input.path}; temporary file could not be removed: nested/.tmp-`,
			);
			expect(message).not.toContain(directory);
			expect(
				(await readdir(join(directory, 'nested'))).filter((name) => name.startsWith('.tmp-')),
			).toHaveLength(1);
			await expect(readFile(join(directory, 'nested', 'existing'), 'utf8')).resolves.toBe(
				'original',
			);
			if (operation === 'create')
				await expect(fsPromises.stat(join(directory, 'nested', 'created'))).rejects.toThrow();
		} finally {
			writeSpy?.mockRestore();
			unlinkSpy?.mockRestore();
			await cleanup();
		}
	});

	test('Windows device, trailing-dot and trailing-space aliases reject before filesystem work', async () => {
		const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
		try {
			Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
			const fileSystem = new NodeWorkspaceFileSystem('/missing-workspace');
			for (const path of [
				'.git./file',
				'new/.agent /file',
				'node_modules./file',
				'CON',
				'NUL.txt',
				'dir/COM1.ts',
				'LPT9',
				'PRN',
				'new/AUX/file',
				'file.',
			]) {
				await expect(
					fileSystem.createFile({ path, content: 'created', maxFileBytes: MAX_FILE_BYTES }),
				).rejects.toThrow('Unsupported Windows path component');
				await expect(fileSystem.deletePath({ path })).rejects.toThrow(
					'Unsupported Windows path component',
				);
			}
		} finally {
			if (descriptor) Object.defineProperty(process, 'platform', descriptor);
		}
	});
});

describe('Phase 14 concurrently removed temporary files', () => {
	test('already absent create temp does not produce a false remnant warning', async () => {
		const { directory, fileSystem, cleanup } = await createTempWorkspace();
		const originalUnlink = fsPromises.unlink;
		const unlinkSpy = spyOn(fsPromises, 'unlink').mockImplementation(
			async (...args: Parameters<typeof fsPromises.unlink>) => {
				await originalUnlink(...args);
				throw Object.assign(new Error('temporary already removed'), { code: 'ENOENT' });
			},
		);
		try {
			await expect(
				fileSystem.createFile({
					path: 'created',
					content: 'complete',
					maxFileBytes: MAX_FILE_BYTES,
				}),
			).resolves.toEqual({ path: 'created', content: 'complete' });
			await expect(readdir(directory)).resolves.toEqual(['created']);
		} finally {
			unlinkSpy.mockRestore();
			await cleanup();
		}
	});
});
