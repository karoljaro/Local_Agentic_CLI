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
	test('lists local tool definitions', () => {
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
			{
				name: 'search_file',
				description:
					'Find relevant content in a workspace. Use this tool to locate files, code, symbols, strings, configuration values, TODOs, errors, logs, and patterns before opening or reading files. Returns matching file paths, line numbers, and excerpts.',
				parameters: {
					type: 'object',
					required: ['query'],
					additionalProperties: false,
					properties: {
						query: {
							type: 'string',
							description:
								'Exact text to search for. Use simple | alternatives for related terms.',
						},
					},
				},
			},
			{
				name: 'edit_file',
				description:
					'Replace exact text in a UTF-8 file in the current workspace. Use this after reading the target file.',
				requiresApproval: true,
				parameters: {
					type: 'object',
					required: ['path', 'oldText', 'newText'],
					additionalProperties: false,
					properties: {
						path: {
							type: 'string',
							description:
								'The path to the file to edit, relative to the workspace root.',
						},
						newText: {
							type: 'string',
							description: 'The replacement text. May be empty to remove oldText.',
						},
						oldText: {
							type: 'string',
							description:
								'The exact text to replace. The edit will only be applied if this text appears exactly once.',
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

	test('searches workspace files with ripgrep', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'src'));
			await writeFile(
				join(directory, 'src', 'first.ts'),
				'const needle = true;\n',
				'utf8',
			);
			await writeFile(
				join(directory, 'src', 'second.ts'),
				'const other = "value";\n',
				'utf8',
			);

			const executor = new LocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: { query: 'needle' },
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					query: 'needle',
					matchCount: 1,
					fileCount: 1,
					topFiles: [
						{
							path: 'src/first.ts',
							matchCount: 1,
						},
					],
					matches: [
						{
							path: 'src/first.ts',
							line: 1,
							text: 'const needle = true;',
						},
					],
					truncated: false,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('returns empty search output when ripgrep finds no matches', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'hello', 'utf8');

			const executor = new LocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: { query: 'missing' },
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					query: 'missing',
					matchCount: 0,
					fileCount: 0,
					topFiles: [],
					matches: [],
					truncated: false,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('falls back to a relevant token when literal search finds no matches', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'tests'));
			await writeFile(
				join(directory, 'tests', 'users.test.ts'),
				'const repo = new UserRepository();\n',
				'utf8',
			);

			const executor = new LocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: { query: 'UserRepository tests' },
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					query: 'UserRepository tests',
					matchCount: 1,
					fileCount: 1,
					topFiles: [
						{
							path: 'tests/users.test.ts',
							matchCount: 1,
						},
					],
					matches: [
						{
							path: 'tests/users.test.ts',
							line: 1,
							text: 'const repo = new UserRepository();',
						},
					],
					truncated: false,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('falls back to pipe-separated query tokens', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			const functionNames = ['add', 'subtract', 'multiply', 'divide'];
			const query = [...functionNames, 'calculate', 'arithmetic'].join('|');
			const pythonFunctionSignature = (name: string): string =>
				`def ${name}(a: float, b: float) -> float:`;

			await mkdir(join(directory, 'src'));
			await writeFile(
				join(directory, 'src', 'calculator.py'),
				[
					pythonFunctionSignature('add'),
					'    return a + b',
					'',
					pythonFunctionSignature('subtract'),
					'    return a - b',
					'',
					pythonFunctionSignature('multiply'),
					'    return a * b',
					'',
					pythonFunctionSignature('divide'),
					'    return a / b',
				].join('\n'),
				'utf8',
			);

			const executor = new LocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: {
					query,
				},
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					query,
					matchCount: 4,
					fileCount: 1,
					topFiles: [
						{
							path: 'src/calculator.py',
							matchCount: 4,
						},
					],
					matches: [
						{
							path: 'src/calculator.py',
							line: 1,
							text: pythonFunctionSignature('add'),
						},
						{
							path: 'src/calculator.py',
							line: 4,
							text: pythonFunctionSignature('subtract'),
						},
						{
							path: 'src/calculator.py',
							line: 7,
							text: pythonFunctionSignature('multiply'),
						},
						{
							path: 'src/calculator.py',
							line: 10,
							text: pythonFunctionSignature('divide'),
						},
					],
					truncated: false,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('rejects empty search queries', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			const executor = new LocalToolExecutor({ workspaceRoot: directory });

			await expect(
				executor.execute({
					toolName: 'search_file',
					toolInput: { query: ' ' },
				}),
			).rejects.toThrow('search_file requires a non-empty string query.');
		} finally {
			await cleanup();
		}
	});

	test('limits returned search matches while preserving total counts', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(
				join(directory, 'file.txt'),
				'needle one\nneedle two\nneedle three\n',
				'utf8',
			);

			const executor = new LocalToolExecutor({
				workspaceRoot: directory,
				maxSearchMatches: 2,
			});
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: { query: 'needle' },
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					query: 'needle',
					matchCount: 3,
					fileCount: 1,
					topFiles: [
						{
							path: 'file.txt',
							matchCount: 3,
						},
					],
					matches: [
						{
							path: 'file.txt',
							line: 1,
							text: 'needle one',
						},
						{
							path: 'file.txt',
							line: 2,
							text: 'needle two',
						},
					],
					truncated: true,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('edits a UTF-8 file in the workspace', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'src'));
			await writeFile(
				join(directory, 'src', 'file.ts'),
				'const value = 1;\n',
				'utf8',
			);

			const executor = new LocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'edit_file',
				toolInput: {
					path: 'src/file.ts',
					oldText: 'const value = 1;',
					newText: 'const value = 2;',
				},
			});

			expect(result).toEqual({
				toolName: 'edit_file',
				output: {
					path: 'src/file.ts',
					replaced: true,
					matchCount: 1,
				},
			});
			await expect(readFile(join(directory, 'src', 'file.ts'), 'utf8')).resolves.toBe(
				'const value = 2;\n',
			);
		} finally {
			await cleanup();
		}
	});

	test('normalizes escaped newlines in edit text', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(
				join(directory, 'demo.py'),
				[
					'def find_user_by_email(self, email):',
					'    for user in self.users:',
					'        if user.email == email:',
					'            return user',
					'    return None',
					'',
				].join('\n'),
				'utf8',
			);

			const executor = new LocalToolExecutor({ workspaceRoot: directory });
			await executor.execute({
				toolName: 'edit_file',
				toolInput: {
					path: 'demo.py',
					oldText:
						'def find_user_by_email(self, email):\\n    for user in self.users:\\n        if user.email == email:\\n            return user\\n    return None',
					newText:
						'def find_user_by_email(self, email):\\n    for user in self.users:\\n        if user.email.lower() == email.lower():\\n            return user\\n    return None',
				},
			});

			await expect(readFile(join(directory, 'demo.py'), 'utf8')).resolves.toBe(
				[
					'def find_user_by_email(self, email):',
					'    for user in self.users:',
					'        if user.email.lower() == email.lower():',
					'            return user',
					'    return None',
					'',
				].join('\n'),
			);
		} finally {
			await cleanup();
		}
	});

	test('rejects edit when oldText is missing', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'hello\n', 'utf8');

			const executor = new LocalToolExecutor({ workspaceRoot: directory });

			await expect(
				executor.execute({
					toolName: 'edit_file',
					toolInput: {
						path: 'file.txt',
						oldText: 'missing',
						newText: 'value',
					},
				}),
			).rejects.toThrow('oldText was not found in file');
		} finally {
			await cleanup();
		}
	});

	test('rejects edit when oldText appears more than once', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'hello\nhello\n', 'utf8');

			const executor = new LocalToolExecutor({ workspaceRoot: directory });

			await expect(
				executor.execute({
					toolName: 'edit_file',
					toolInput: {
						path: 'file.txt',
						oldText: 'hello',
						newText: 'hi',
					},
				}),
			).rejects.toThrow('oldText appears multiple times in file');
		} finally {
			await cleanup();
		}
	});

	test('rejects edit paths outside the workspace', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			const executor = new LocalToolExecutor({ workspaceRoot: directory });

			await expect(
				executor.execute({
					toolName: 'edit_file',
					toolInput: {
						path: '../outside.txt',
						oldText: 'hello',
						newText: 'hi',
					},
				}),
			).rejects.toThrow('Cannot edit file outside workspace');
		} finally {
			await cleanup();
		}
	});
});
