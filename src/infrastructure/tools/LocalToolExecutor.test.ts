import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { LocalToolExecutor } from './LocalToolExecutor';

const createTempWorkspace = async (): Promise<{
	directory: string;
	cleanup: () => Promise<void>;
}> => {
	const directory = await mkdtemp(join(tmpdir(), 'local-tool-executor-'));

	return {
		directory,
		cleanup: () => rm(directory, { recursive: true, force: true }),
	};
};

describe('LocalToolExecutor', () => {
	test('lists the read_file tool definition', () => {
		const executor = new LocalToolExecutor();

		expect(executor.listTools()).toEqual([
			{
				name: 'read_file',
				description:
					'Read a UTF-8 text file from the current workspace. Use relative paths.',
				parameters: {
					type: 'object',
					required: ['path'],
					additionalProperties: false,
					properties: {
						path: {
							type: 'string',
							description: 'Relative path to a file in the current workspace.',
						},
					},
				},
			},
		]);
	});

	test('reads a UTF-8 file from the workspace', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'src'));
			await writeFile(join(directory, 'src', 'file.txt'), 'hello', 'utf8');

			const executor = new LocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'read_file',
				toolInput: { path: 'src/file.txt' },
			});

			expect(result).toEqual({
				toolName: 'read_file',
				output: {
					path: 'src/file.txt',
					content: 'hello',
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('rejects paths outside the workspace', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			const executor = new LocalToolExecutor({ workspaceRoot: directory });

			await expect(
				executor.execute({
					toolName: 'read_file',
					toolInput: { path: '../outside.txt' },
				}),
			).rejects.toThrow('Cannot read file outside workspace');
		} finally {
			await cleanup();
		}
	});

	test('rejects absolute paths', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			const executor = new LocalToolExecutor({ workspaceRoot: directory });

			await expect(
				executor.execute({
					toolName: 'read_file',
					toolInput: { path: join(directory, 'file.txt') },
				}),
			).rejects.toThrow('read_file requires a relative path.');
		} finally {
			await cleanup();
		}
	});

	test('rejects symlinks that point outside the workspace', async () => {
		const { directory, cleanup } = await createTempWorkspace();
		const outsideDirectory = await mkdtemp(join(tmpdir(), 'outside-workspace-'));

		try {
			await writeFile(join(outsideDirectory, 'secret.txt'), 'secret', 'utf8');
			await symlink(join(outsideDirectory, 'secret.txt'), join(directory, 'link.txt'));

			const executor = new LocalToolExecutor({ workspaceRoot: directory });

			await expect(
				executor.execute({
					toolName: 'read_file',
					toolInput: { path: 'link.txt' },
				}),
			).rejects.toThrow('Cannot read file outside workspace');
		} finally {
			await cleanup();
			await rm(outsideDirectory, { recursive: true, force: true });
		}
	});

	test('rejects files above the size limit', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'large.txt'), 'hello', 'utf8');

			const executor = new LocalToolExecutor({
				workspaceRoot: directory,
				maxFileBytes: 3,
			});

			await expect(
				executor.execute({
					toolName: 'read_file',
					toolInput: { path: 'large.txt' },
				}),
			).rejects.toThrow('File is too large');
		} finally {
			await cleanup();
		}
	});
});
