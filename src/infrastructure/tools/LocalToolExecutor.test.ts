import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';

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
		const executor = createLocalToolExecutor();

		expect(executor.listTools()).toEqual([
			{
				name: 'list_files',
				description:
					'Recursively list file paths in the workspace or under an optional relative path. Use this to discover project structure or locate files by name or extension. Do not use it to search file contents; use search_file instead.',
				parameters: {
					type: 'object',
					required: [],
					additionalProperties: false,
					properties: {
						path: {
							type: 'string',
							description:
								'Optional relative file or directory path. Defaults to the workspace root.',
						},
					},
				},
			},
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
					'Search workspace files for exact text. Use | for alternatives. Returns matching paths, line numbers, and excerpts.',
				parameters: {
					type: 'object',
					required: ['query'],
					additionalProperties: false,
					properties: {
						query: {
							type: 'string',
							description: 'Exact text or | separated alternatives.',
						},
					},
				},
			},
			{
				name: 'create_file',
				description:
					'Create a new UTF-8 file in an existing workspace directory. Fails if the file already exists.',
				requiresApproval: true,
				parameters: {
					type: 'object',
					required: ['path', 'content'],
					additionalProperties: false,
					properties: {
						path: {
							type: 'string',
							description:
								'The path for the new file, relative to the workspace root.',
						},
						content: {
							type: 'string',
							description: 'The complete content of the new file.',
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

	test('lists workspace file paths', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'src', 'nested'), { recursive: true });
			await writeFile(join(directory, 'src', 'first.ts'), 'first', 'utf8');
			await writeFile(
				join(directory, 'src', 'nested', 'second.ts'),
				'second',
				'utf8',
			);

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'list_files',
				toolInput: {},
			});

			expect(result).toEqual({
				toolName: 'list_files',
				output: {
					files: ['src/first.ts', 'src/nested/second.ts'],
					truncated: false,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('reads a UTF-8 file from the workspace', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'src'));
			await writeFile(join(directory, 'src', 'file.txt'), 'hello', 'utf8');

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
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

	test('creates a new UTF-8 file in the workspace', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'src'));

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'create_file',
				toolInput: {
					path: 'src/new-file.ts',
					content: 'export const value = 1;\n',
				},
			});

			expect(result).toEqual({
				toolName: 'create_file',
				output: {
					path: 'src/new-file.ts',
					content: 'export const value = 1;\n',
				},
			});
			await expect(
				readFile(join(directory, 'src', 'new-file.ts'), 'utf8'),
			).resolves.toBe('export const value = 1;\n');
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

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: { query: 'needle' },
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					matchCount: 1,
					fileCount: 1,
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

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: { query: 'missing' },
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					matchCount: 0,
					fileCount: 0,
					matches: [],
					truncated: false,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('does not split natural-language queries into fallback tokens', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'tests'));
			await writeFile(
				join(directory, 'tests', 'users.test.ts'),
				'const repo = new UserRepository();\n',
				'utf8',
			);

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: { query: 'UserRepository tests' },
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					matchCount: 0,
					fileCount: 0,
					matches: [],
					truncated: false,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('searches pipe-separated alternatives', async () => {
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

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: {
					query,
				},
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					matchCount: 4,
					fileCount: 1,
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

	test('searches pipe-separated terms without definition-only fallback', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'src'));
			await writeFile(
				join(directory, 'src', 'calculator.py'),
				['def add(a, b):', '    return a + b', ''].join('\n'),
				'utf8',
			);
			await writeFile(
				join(directory, 'src', 'usage.ts'),
				'calculator.divide(10, 2);\n',
				'utf8',
			);

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: { query: 'add|divide' },
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					matchCount: 2,
					fileCount: 2,
					matches: [
						{
							path: 'src/calculator.py',
							line: 1,
							text: 'def add(a, b):',
						},
						{
							path: 'src/usage.ts',
							line: 1,
							text: 'calculator.divide(10, 2);',
						},
					],
					truncated: false,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('excludes secret env files but includes safe env examples', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, '.env'), 'SECRET_TOKEN=hidden\n', 'utf8');
			await writeFile(
				join(directory, '.env.example'),
				'SECRET_TOKEN=example\n',
				'utf8',
			);

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_file',
				toolInput: { query: 'SECRET_TOKEN' },
			});

			expect(result).toEqual({
				toolName: 'search_file',
				output: {
					matchCount: 1,
					fileCount: 1,
					matches: [
						{
							path: '.env.example',
							line: 1,
							text: 'SECRET_TOKEN=example',
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
			const executor = createLocalToolExecutor({ workspaceRoot: directory });

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

			const executor = createLocalToolExecutor({
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
					matchCount: 3,
					fileCount: 1,
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

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
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

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
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

	test('rejects edit when replacement exceeds the file size limit', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'short', 'utf8');

			const executor = createLocalToolExecutor({
				workspaceRoot: directory,
				maxFileBytes: 8,
			});

			await expect(
				executor.execute({
					toolName: 'edit_file',
					toolInput: {
						path: 'file.txt',
						oldText: 'short',
						newText: 'long replacement',
					},
				}),
			).rejects.toThrow('File content is too large');
		} finally {
			await cleanup();
		}
	});

	test('rejects edit when oldText is missing', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'hello\n', 'utf8');

			const executor = createLocalToolExecutor({ workspaceRoot: directory });

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

			const executor = createLocalToolExecutor({ workspaceRoot: directory });

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
			const executor = createLocalToolExecutor({ workspaceRoot: directory });

			await expect(
				executor.execute({
					toolName: 'edit_file',
					toolInput: {
						path: '../outside.txt',
						oldText: 'hello',
						newText: 'hi',
					},
				}),
			).rejects.toThrow('Cannot access file outside workspace');
		} finally {
			await cleanup();
		}
	});
});
