import type {
	WorkspaceExecutionOptions,
	WorkspaceFilePort,
} from '@/application/ports/WorkspaceFilePort';
import { EditWorkspaceFile } from '@/application/use-cases/file-operations/EditWorkspaceFile';
import { LocalToolRegistry } from './LocalToolExecutor';
import { defineLocalTool } from './LocalTool';
import { listDirectoryTool } from './providers/ListDirectoryProvider';
import { findFilesTool } from './providers/FindFilesProvider';
import { readFileTool } from './providers/ReadFileProvider';
import { searchTextTool } from './providers/SearchTextProvider';
import { replaceFileTool } from './providers/ReplaceFileProvider';
import { moveFileTool } from './providers/MoveFileProvider';
import { deletePathTool } from './providers/DeletePathProvider';
import { createFileTool } from './providers/CreateFileProvider';
import { editFileTool } from './providers/EditFileProvider';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { createTempDirectory } from '@/test-support/createTempDirectory';

const createTempWorkspace = async (): Promise<{
	directory: string;
	cleanup: () => Promise<void>;
}> => createTempDirectory('local-tool-executor-');

const contentVersion = (content: string): string =>
	createHash('sha256').update(content).digest('hex');

const recordingWorkspaceFiles = (
	record: (input: unknown, options: WorkspaceExecutionOptions) => void,
): WorkspaceFilePort => ({
	listDirectory: async (input, options = {}) => {
		record(input, options);
		return { path: input.path ?? '.', entries: [], truncated: false };
	},
	findFiles: async (input, options = {}) => {
		record(input, options);
		return { files: [], truncated: false };
	},
	readFile: async (input, options = {}) => {
		record(input, options);
		return { path: input.path, content: 'target' };
	},
	writeFile: async (input, options = {}) => {
		record(input, options);
		return { path: input.path, content: input.content };
	},
	createFile: async (input, options = {}) => {
		record(input, options);
		return { path: input.path, content: input.content };
	},
	moveFile: async (input, options = {}) => {
		record(input, options);
		return { ...input, moved: true };
	},
	deletePath: async (input, options = {}) => {
		record(input, options);
		return { path: input.path, type: 'file', deleted: true };
	},
});

const allWorkspaceRequests = [
	{ toolName: 'list_directory', toolInput: {} },
	{ toolName: 'find_files', toolInput: { pattern: '**/*.ts' } },
	{ toolName: 'read_file', toolInput: { path: 'file' } },
	{ toolName: 'search_text', toolInput: { query: 'target' } },
	{ toolName: 'create_file', toolInput: { path: 'new', content: 'created' } },
	{
		toolName: 'edit_file',
		toolInput: { path: 'file', edits: [{ oldText: 'target', newText: '$&' }] },
	},
	{
		toolName: 'replace_file',
		toolInput: { path: 'file', content: 'replacement', expectedVersion: contentVersion('target') },
	},
	{ toolName: 'move_file', toolInput: { source: 'file', destination: 'renamed' } },
	{ toolName: 'delete_path', toolInput: { path: 'renamed' } },
];

const registryWithWorkspaceFiles = (
	files: WorkspaceFilePort,
	search: Parameters<typeof searchTextTool>[0],
): LocalToolRegistry =>
	new LocalToolRegistry([
		listDirectoryTool(files, { maxEntries: 10 }),
		findFilesTool(files, { maxEntries: 10 }),
		readFileTool(files, { maxFileBytes: 1024, maxCharacters: 100, maxLines: 10 }),
		searchTextTool(search),
		createFileTool(files, { maxFileBytes: 1024 }),
		editFileTool(new EditWorkspaceFile(files), { maxFileBytes: 1024 }),
		replaceFileTool(files, { maxFileBytes: 1024 }),
		moveFileTool(files),
		deletePathTool(files),
	]);

type ReadInput = {
	path: string;
	startLine?: number;
	startOffset?: number;
	endLine?: number;
};

type ReadPage = {
	path: string;
	content: string;
	startLine: number;
	endLine: number;
	totalLines: number;
	truncated: boolean;
	nextRead?: { path: string; startOffset: number; endLine?: number };
};

const readPage = async (
	executor: ReturnType<typeof createLocalToolExecutor>,
	input: ReadInput,
): Promise<ReadPage> =>
	(await executor.execute({ toolName: 'read_file', toolInput: input })).output as ReadPage;

const readAllPages = async (
	executor: ReturnType<typeof createLocalToolExecutor>,
	initialInput: ReadInput,
	expectedContent: string,
	limits: { maxCharacters: number; maxLines: number },
	firstOffset = initialInput.startOffset ?? 0,
): Promise<ReadPage[]> => {
	const pages: ReadPage[] = [];
	let input = initialInput;
	let reconstructed = '';

	// At most one initial empty line page, then at least one UTF-16 unit per cursor page.
	for (let index = 0; index < expectedContent.length + 2; index += 1) {
		const page = await readPage(executor, input);
		pages.push(page);
		expect(page.content.length).toBeLessThanOrEqual(limits.maxCharacters);
		const lineSegments =
			page.content.length === 0
				? 0
				: page.content.split('\n').length - (page.content.endsWith('\n') ? 1 : 0);
		expect(lineSegments).toBeLessThanOrEqual(limits.maxLines);
		expect(page.content).toBe(
			expectedContent.slice(reconstructed.length, reconstructed.length + page.content.length),
		);
		reconstructed += page.content;

		if (page.nextRead === undefined) {
			expect(reconstructed).toBe(expectedContent);
			return pages;
		}

		expect(reconstructed.length).toBeLessThan(expectedContent.length);
		expect(page.nextRead).toEqual({
			path: page.path,
			startOffset: firstOffset + reconstructed.length,
			...(initialInput.endLine === undefined ? {} : { endLine: initialInput.endLine }),
		});
		if (input.startOffset !== undefined) {
			expect(page.content.length).toBeGreaterThan(0);
			expect(page.nextRead.startOffset).toBeGreaterThan(input.startOffset);
		}
		// Exercise the public contract: return the cursor unchanged, including endLine.
		input = page.nextRead;
	}

	throw new Error('read_file continuation did not exhaust the requested content');
};

describe('LocalToolRegistry', () => {
	test('lists the final model-visible tools', () => {
		expect(
			createLocalToolExecutor()
				.listTools()
				.map((tool) => tool.name),
		).toEqual([
			'list_directory',
			'find_files',
			'read_file',
			'search_text',
			'create_file',
			'edit_file',
			'replace_file',
			'move_file',
			'delete_path',
		]);
	});

	test('uses the registered schema to normalize and reject tool input', () => {
		const executor = createLocalToolExecutor();

		expect(
			executor.prepare({
				toolName: 'search_text',
				toolInput: { query: '  needle  ' },
			}),
		).toMatchObject({
			toolName: 'search_text',
			toolInput: { query: '  needle  ' },
		});
		expect(() =>
			executor.prepare({
				toolName: 'search_text',
				toolInput: { query: 'needle', unexpected: true },
			}),
		).toThrow('Invalid arguments for tool search_text');
		expect(() =>
			executor.prepare({
				toolName: 'missing_tool',
				toolInput: {},
			}),
		).toThrow('Unknown tool requested by model: missing_tool');
	});

	test('lists typed entries one level deep by default', async () => {
		const { directory, cleanup } = await createTempWorkspace();
		try {
			await mkdir(join(directory, 'src', 'nested'), { recursive: true });
			await writeFile(join(directory, 'src', 'first.ts'), 'first', 'utf8');
			await writeFile(join(directory, 'src', 'nested', 'second.ts'), 'second', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			expect(
				(await executor.execute({ toolName: 'list_directory', toolInput: {} })).output,
			).toEqual({
				path: '.',
				entries: [{ path: 'src', type: 'directory' }],
				truncated: false,
			});
			expect(
				(await executor.execute({ toolName: 'list_directory', toolInput: { path: 'src' } })).output,
			).toEqual({
				path: 'src',
				entries: [
					{ path: 'src/first.ts', type: 'file' },
					{ path: 'src/nested', type: 'directory' },
				],
				truncated: false,
			});
			expect(
				(await executor.execute({ toolName: 'find_files', toolInput: { pattern: '**/*.ts' } }))
					.output,
			).toEqual({
				files: ['src/first.ts', 'src/nested/second.ts'],
				truncated: false,
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

			expect(result).toMatchObject({
				toolName: 'read_file',
				output: {
					path: 'src/file.txt',
					content: 'hello',
					startLine: 1,
					endLine: 1,
					totalLines: 1,
					truncated: false,
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

			expect(result).toMatchObject({
				toolName: 'create_file',
				output: {
					path: 'src/new-file.ts',
					created: true,
				},
			});
			await expect(readFile(join(directory, 'src', 'new-file.ts'), 'utf8')).resolves.toBe(
				'export const value = 1;\n',
			);
		} finally {
			await cleanup();
		}
	});

	test('reads a bounded line range and reports continuation metadata', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'one\ntwo\nthree\nfour', 'utf8');
			const executor = createLocalToolExecutor({
				workspaceRoot: directory,
				maxReadLines: 2,
				maxReadCharacters: 100,
			});

			const result = await executor.execute({
				toolName: 'read_file',
				toolInput: { path: 'file.txt', startLine: 2, endLine: 4 },
			});

			expect(result.output).toMatchObject({
				path: 'file.txt',
				content: 'two\nthree',
				startLine: 2,
				endLine: 3,
				totalLines: 4,
				truncated: true,
				nextRead: { path: 'file.txt', startOffset: 13, endLine: 4 },
			});
		} finally {
			await cleanup();
		}
	});

	test('returns stable range metadata for an empty file', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'empty.txt'), '', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory });

			const result = await executor.execute({
				toolName: 'read_file',
				toolInput: { path: 'empty.txt' },
			});

			expect(result.output).toMatchObject({
				path: 'empty.txt',
				content: '',
				startLine: 1,
				endLine: 0,
				totalLines: 0,
				truncated: false,
			});
		} finally {
			await cleanup();
		}
	});

	test('limits read output characters and validates line ranges', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'abcdefghij\nsecond', 'utf8');
			const executor = createLocalToolExecutor({
				workspaceRoot: directory,
				maxReadLines: 10,
				maxReadCharacters: 5,
			});

			await expect(
				executor.execute({
					toolName: 'read_file',
					toolInput: { path: 'file.txt', startLine: 3 },
				}),
			).rejects.toThrow('startLine exceeds the file length');
			await expect(
				executor.execute({
					toolName: 'read_file',
					toolInput: { path: 'file.txt', startLine: 2, endLine: 1 },
				}),
			).rejects.toThrow('endLine must be greater than or equal to startLine');

			const result = await executor.execute({
				toolName: 'read_file',
				toolInput: { path: 'file.txt' },
			});

			expect(result.output).toMatchObject({
				content: 'abcde',
				startLine: 1,
				endLine: 1,
				totalLines: 2,
				truncated: true,
			});
		} finally {
			await cleanup();
		}
	});

	test('continues from the first unreturned character of abcdefghij with limit 5', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'abcdefghij', 'utf8');
			const executor = createLocalToolExecutor({
				workspaceRoot: directory,
				maxReadCharacters: 5,
			});
			const pages = await readAllPages(executor, { path: 'file.txt' }, 'abcdefghij', {
				maxCharacters: 5,
				maxLines: 400,
			});

			expect(pages.map((page) => page.content)).toEqual(['abcde', 'fghij']);
			expect(pages[0]?.nextRead).toEqual({ path: 'file.txt', startOffset: 5 });
			expect(pages[1]?.nextRead).toBeUndefined();
		} finally {
			await cleanup();
		}
	});

	for (const fixture of [
		{ name: 'multiline', content: 'one\ntwo\nthree\nfour', maxCharacters: 5, maxLines: 2 },
		{
			name: 'very long single line',
			content: '0123456789'.repeat(1000),
			maxCharacters: 127,
			maxLines: 1,
		},
		{ name: 'exact newline boundary', content: 'abc\ndef\nghi', maxCharacters: 3, maxLines: 1 },
		{
			name: 'CRLF split between pages',
			content: 'one\r\ntwo\r\n\r\nthree\r\n',
			maxCharacters: 1,
			maxLines: 1,
		},
		{ name: 'UTF-16 surrogate pairs', content: 'A😀ż𝄞\n🙂B', maxCharacters: 2, maxLines: 2 },
		{ name: 'exact-limit EOF', content: 'abcde', maxCharacters: 5, maxLines: 1 },
		{ name: 'trailing newline', content: 'abcde\n', maxCharacters: 5, maxLines: 1 },
		{ name: 'empty file', content: '', maxCharacters: 5, maxLines: 1 },
		{ name: 'leading and consecutive newlines', content: '\n\nx\n', maxCharacters: 1, maxLines: 1 },
		{ name: 'only a newline', content: '\n', maxCharacters: 5, maxLines: 1 },
		{ name: 'literal escaped newlines', content: 'a\\nb\\r\\nc', maxCharacters: 3, maxLines: 1 },
	]) {
		test(`reconstructs original content by following nextRead: ${fixture.name}`, async () => {
			const { directory, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, 'file.txt'), fixture.content, 'utf8');
				const executor = createLocalToolExecutor({
					workspaceRoot: directory,
					maxReadCharacters: fixture.maxCharacters,
					maxReadLines: fixture.maxLines,
				});
				const pages = await readAllPages(executor, { path: 'file.txt' }, fixture.content, fixture);

				if (fixture.name === 'exact-limit EOF') {
					expect(pages).toHaveLength(1);
					expect(pages[0]?.truncated).toBe(false);
					expect(pages[0]?.nextRead).toBeUndefined();
				}
			} finally {
				await cleanup();
			}
		});
	}

	test('consumes newline cursors within line limits and reports only touched lines', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'ab\ncd\nx', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory, maxReadLines: 1 });
			const pages = await readAllPages(executor, { path: 'file.txt' }, 'ab\ncd\nx', {
				maxCharacters: 20_000,
				maxLines: 1,
			});

			expect(
				pages.map(({ content, startLine, endLine }) => ({ content, startLine, endLine })),
			).toEqual([
				{ content: 'ab', startLine: 1, endLine: 1 },
				{ content: '\n', startLine: 1, endLine: 1 },
				{ content: 'cd\n', startLine: 2, endLine: 2 },
				{ content: 'x', startLine: 3, endLine: 3 },
			]);
		} finally {
			await cleanup();
		}
	});

	for (const fixture of [
		{
			name: 'middle of a long line',
			file: 'zero\nabcdefghij\nlast\n',
			input: { startLine: 2, endLine: 2 },
			expected: 'abcdefghij',
			firstOffset: 5,
		},
		{
			name: 'multiple lines',
			file: 'one\ntwo\nthree\nfour',
			input: { startLine: 2, endLine: 3 },
			expected: 'two\nthree',
			firstOffset: 4,
		},
		{
			name: 'endpoint beyond EOF',
			file: 'one\ntwo\nthree\nfour',
			input: { startLine: 2, endLine: 99 },
			expected: 'two\nthree\nfour',
			firstOffset: 4,
		},
		{
			name: 'CRLF endpoint',
			file: 'skip\r\nkeep\r\nlast',
			input: { startLine: 2, endLine: 2 },
			expected: 'keep\r',
			firstOffset: 6,
		},
		{
			name: 'cursor input',
			file: 'one\ntwo\nthree\nfour',
			input: { startOffset: 5, endLine: 3 },
			expected: 'wo\nthree',
			firstOffset: 5,
		},
	]) {
		test(`retains explicit endLine while reconstructing a range: ${fixture.name}`, async () => {
			const { directory, cleanup } = await createTempWorkspace();

			try {
				await writeFile(join(directory, 'file.txt'), fixture.file, 'utf8');
				const executor = createLocalToolExecutor({
					workspaceRoot: directory,
					maxReadCharacters: 3,
					maxReadLines: 1,
				});
				const pages = await readAllPages(
					executor,
					{ path: 'file.txt', ...fixture.input },
					fixture.expected,
					{ maxCharacters: 3, maxLines: 1 },
					fixture.firstOffset,
				);

				expect(pages.at(-1)?.truncated).toBe(true);
				expect(pages.at(-1)?.nextRead).toBeUndefined();
			} finally {
				await cleanup();
			}
		});
	}

	test('preserves complete line-only reads and separates truncation from continuation', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'one\ntwo\n', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory });

			expect(await readPage(executor, { path: 'file.txt' })).toMatchObject({
				path: 'file.txt',
				content: 'one\ntwo\n',
				startLine: 1,
				endLine: 3,
				totalLines: 3,
				truncated: false,
			});
			expect(
				await readPage(executor, { path: 'file.txt', startLine: 2, endLine: 2 }),
			).toMatchObject({
				path: 'file.txt',
				content: 'two',
				startLine: 2,
				endLine: 2,
				totalLines: 3,
				truncated: true,
			});
			expect(await readPage(executor, { path: 'file.txt', startLine: 3 })).toMatchObject({
				path: 'file.txt',
				content: '',
				startLine: 3,
				endLine: 3,
				totalLines: 3,
				truncated: true,
			});
		} finally {
			await cleanup();
		}
	});

	test('accepts exhausted offsets and rejects offsets beyond the file or explicit endpoint', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'abc\ndef\n', 'utf8');
			await writeFile(join(directory, 'empty.txt'), '', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory });

			for (const input of [
				{ path: 'file.txt', startOffset: 8 },
				{ path: 'file.txt', startOffset: 3, endLine: 1 },
				{ path: 'empty.txt', startOffset: 0, endLine: 1 },
			]) {
				const page = await readPage(executor, input);
				expect(page.content).toBe('');
				expect(page.nextRead).toBeUndefined();
				if (input.path === 'empty.txt') {
					expect(page).toMatchObject({ startLine: 1, endLine: 0, totalLines: 0, truncated: false });
				}
			}
			for (const input of [
				{ path: 'file.txt', startOffset: 9 },
				{ path: 'file.txt', startOffset: 4, endLine: 1 },
				{ path: 'empty.txt', startOffset: 1 },
			]) {
				await expect(readPage(executor, input)).rejects.toThrow(
					'startOffset exceeds the requested range',
				);
			}
		} finally {
			await cleanup();
		}
	});

	test('rejects invalid offsets and combined cursor/line inputs through the public schema', async () => {
		const executor = createLocalToolExecutor();
		for (const startOffset of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', null]) {
			await expect(
				executor.execute({
					toolName: 'read_file',
					toolInput: { path: 'file.txt', startOffset },
				}),
			).rejects.toThrow('Invalid arguments for tool read_file');
		}
		await expect(
			executor.execute({
				toolName: 'read_file',
				toolInput: { path: 'file.txt', startOffset: 0, startLine: 1 },
			}),
		).rejects.toThrow('startOffset and startLine must not be supplied together');
	});

	test('interprets cursor and character limits as UTF-16 units, including split surrogate pairs', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'A😀żB', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory, maxReadCharacters: 2 });
			const pages = await readAllPages(executor, { path: './file.txt' }, 'A😀żB', {
				maxCharacters: 2,
				maxLines: 400,
			});

			expect(pages.map((page) => page.content)).toEqual(['A\uD83D', '\uDE00ż', 'B']);
			expect(pages[0]?.nextRead).toEqual({ path: 'file.txt', startOffset: 2 });
			expect(await readPage(executor, { path: 'file.txt', startOffset: 2 })).toMatchObject({
				content: '\uDE00ż',
				nextRead: { path: 'file.txt', startOffset: 4 },
			});
		} finally {
			await cleanup();
		}
	});

	test('enforces the existing byte limit on cursor reads', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), '😀', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory, maxFileBytes: 3 });
			await expect(readPage(executor, { path: 'file.txt', startOffset: 0 })).rejects.toThrow(
				'File is too large',
			);
		} finally {
			await cleanup();
		}
	});

	test('searches workspace files with ripgrep', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'src'));
			await writeFile(join(directory, 'src', 'first.ts'), 'const needle = true;\n', 'utf8');
			await writeFile(join(directory, 'src', 'second.ts'), 'const other = "value";\n', 'utf8');

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_text',
				toolInput: { query: 'needle' },
			});

			expect(result).toEqual({
				toolName: 'search_text',
				output: {
					returnedMatches: 1,
					returnedFiles: 1,
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
				toolName: 'search_text',
				toolInput: { query: 'missing' },
			});

			expect(result).toEqual({
				toolName: 'search_text',
				output: {
					returnedMatches: 0,
					returnedFiles: 0,
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
				toolName: 'search_text',
				toolInput: { query: 'UserRepository tests' },
			});

			expect(result).toEqual({
				toolName: 'search_text',
				output: {
					returnedMatches: 0,
					returnedFiles: 0,
					matches: [],
					truncated: false,
				},
			});
		} finally {
			await cleanup();
		}
	});

	test('searches pipes and whitespace literally without hidden query syntax', async () => {
		const { directory, cleanup } = await createTempWorkspace();
		try {
			await writeFile(
				join(directory, 'literal.txt'),
				'left|right\n  padded  \nleft\nright\n',
				'utf8',
			);
			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			for (const [query, line, text] of [
				['left|right', 1, 'left|right'],
				['  padded  ', 2, '  padded  '],
			] as const) {
				const output = (await executor.execute({ toolName: 'search_text', toolInput: { query } }))
					.output;
				expect(output).toEqual({
					returnedMatches: 1,
					returnedFiles: 1,
					matches: [{ path: 'literal.txt', line, text }],
					truncated: false,
				});
			}
		} finally {
			await cleanup();
		}
	});

	test('excludes secret env files but includes safe env examples', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, '.env'), 'SECRET_TOKEN=hidden\n', 'utf8');
			await writeFile(join(directory, '.env.example'), 'SECRET_TOKEN=example\n', 'utf8');

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'search_text',
				toolInput: { query: 'SECRET_TOKEN' },
			});

			expect(result).toEqual({
				toolName: 'search_text',
				output: {
					returnedMatches: 1,
					returnedFiles: 1,
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

	test('search_text preserves exact env and nested directory policy with real ripgrep', async () => {
		const { directory, cleanup } = await createTempWorkspace();
		const marker = 'PHASE9_WORKSPACE_POLICY_MARKER';
		const allowedPaths = [
			'.env.dev',
			'.env.development',
			'.env.example',
			'nested/.env.dev',
			'nested/.env.development',
			'nested/.env.example',
			'src/visible.ts',
		];
		const protectedPaths = ['project/node_modules', 'nested/.git', 'foo/bar/.agent'].flatMap(
			(path) => [
				`${path}/hidden.ts`,
				`${path}/.env.dev`,
				`${path}/.env.development`,
				`${path}/.env.example`,
			],
		);
		const secretPaths = ['', 'nested/'].flatMap((prefix) =>
			[
				'.env',
				'.env.local',
				'.env.production',
				'.env.secret',
				'.env.private',
				'.env.dev.secret',
				'.env.development.local',
				'.env.example.backup',
			].map((basename) => `${prefix}${basename}`),
		);
		try {
			for (const path of [...allowedPaths, ...protectedPaths, ...secretPaths]) {
				await mkdir(dirname(join(directory, path)), { recursive: true });
				await writeFile(join(directory, path), `${marker}:${path}\n`);
			}
			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			await expect(
				executor.execute({
					toolName: 'search_text',
					toolInput: { query: marker },
				}),
			).resolves.toEqual({
				toolName: 'search_text',
				output: {
					returnedMatches: 7,
					returnedFiles: 7,
					matches: allowedPaths.map((path) => ({ path, line: 1, text: `${marker}:${path}` })),
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

			for (const query of ['', 'first\nsecond', 'first\rsecond', 'first\0second']) {
				await expect(
					executor.execute({ toolName: 'search_text', toolInput: { query } }),
				).rejects.toThrow('Invalid arguments for tool search_text');
			}
		} finally {
			await cleanup();
		}
	});

	test('limits returned search matches without scanning for an exact total', async () => {
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
				toolName: 'search_text',
				toolInput: { query: 'needle' },
			});

			expect(result).toEqual({
				toolName: 'search_text',
				output: {
					returnedMatches: 2,
					returnedFiles: 1,
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

	test.each([
		'$&',
		'$$',
		'$`',
		"$'",
	])('writes replacement patterns literally through edit_file: %j', async (newText) => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'file.txt'), 'before target after', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory });

			const result = await executor.execute({
				toolName: 'edit_file',
				toolInput: { path: 'file.txt', edits: [{ oldText: 'target', newText }] },
			});

			expect(result.output).toEqual({ path: 'file.txt', changed: true, editsApplied: 1 });
			await expect(readFile(join(directory, 'file.txt'), 'utf8')).resolves.toBe(
				`before ${newText} after`,
			);
		} finally {
			await cleanup();
		}
	});

	test('edits a UTF-8 file in the workspace', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await mkdir(join(directory, 'src'));
			await writeFile(join(directory, 'src', 'file.ts'), 'const value = 1;\n', 'utf8');

			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const result = await executor.execute({
				toolName: 'edit_file',
				toolInput: {
					path: 'src/file.ts',
					edits: [
						{
							oldText: 'const value = 1;',
							newText: 'const value = 2;',
						},
					],
				},
			});

			expect(result).toEqual({
				toolName: 'edit_file',
				output: {
					path: 'src/file.ts',
					changed: true,
					editsApplied: 1,
				},
			});
			await expect(readFile(join(directory, 'src', 'file.ts'), 'utf8')).resolves.toBe(
				'const value = 2;\n',
			);
		} finally {
			await cleanup();
		}
	});

	test('edits exact multiline text', async () => {
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
					edits: [
						{
							oldText:
								'def find_user_by_email(self, email):\n    for user in self.users:\n        if user.email == email:\n            return user\n    return None',
							newText:
								'def find_user_by_email(self, email):\n    for user in self.users:\n        if user.email.lower() == email.lower():\n            return user\n    return None',
						},
					],
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

	test('preserves literal escaped line-break sequences in edit text', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'literal.txt'), 'before\\nvalue after', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory });

			await executor.execute({
				toolName: 'edit_file',
				toolInput: {
					path: 'literal.txt',
					edits: [
						{
							oldText: 'before\\nvalue',
							newText: 'after\\r\\nvalue',
						},
					],
				},
			});

			await expect(readFile(join(directory, 'literal.txt'), 'utf8')).resolves.toBe(
				'after\\r\\nvalue after',
			);
		} finally {
			await cleanup();
		}
	});

	test('uses newline escapes decoded from JSON exactly once', async () => {
		const { directory, cleanup } = await createTempWorkspace();

		try {
			await writeFile(join(directory, 'json.txt'), 'literal\\nvalue', 'utf8');
			const executor = createLocalToolExecutor({ workspaceRoot: directory });
			const toolInput: unknown = JSON.parse(
				'{"path":"json.txt","edits":[{"oldText":"literal\\\\nvalue","newText":"updated\\\\nvalue"}]}',
			);

			await executor.execute({
				toolName: 'edit_file',
				toolInput,
			});

			await expect(readFile(join(directory, 'json.txt'), 'utf8')).resolves.toBe('updated\\nvalue');
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
						edits: [
							{
								oldText: 'short',
								newText: 'long replacement',
							},
						],
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
						edits: [
							{
								oldText: 'missing',
								newText: 'value',
							},
						],
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
						edits: [
							{
								oldText: 'hello',
								newText: 'hi',
							},
						],
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
						edits: [
							{
								oldText: 'hello',
								newText: 'hi',
							},
						],
					},
				}),
			).rejects.toThrow('Cannot access file outside workspace');
		} finally {
			await cleanup();
		}
	});
});

describe('LocalToolRegistry execution options', () => {
	test('all providers forward the same signal outside parsed arguments and schemas', async () => {
		const options = { signal: new AbortController().signal };
		const received: WorkspaceExecutionOptions[] = [];
		const inputs: unknown[] = [];
		const record = (input: unknown, execution: WorkspaceExecutionOptions) => {
			inputs.push(input);
			received.push(execution);
		};
		const tools = registryWithWorkspaceFiles(recordingWorkspaceFiles(record), {
			search: async (input, execution = {}) => {
				record(input, execution);
				return { returnedMatches: 0, returnedFiles: 0, matches: [], truncated: false };
			},
		});
		for (const request of allWorkspaceRequests) await tools.execute(request, options);
		expect(received).toHaveLength(11);
		for (const execution of received) expect(execution).toBe(options);
		for (const input of inputs) expect(input).not.toHaveProperty('signal');
		expect(JSON.stringify(tools.listTools())).not.toContain('signal');
	});

	test('public raw execution with an already aborted signal never invokes a provider', async () => {
		let executions = 0;
		const controller = new AbortController();
		controller.abort();
		const tools = new LocalToolRegistry([
			defineLocalTool({
				name: 'test',
				description: '',
				inputSchema: z.strictObject({}),
				execute: async () => {
					executions++;
					return {};
				},
			}),
		]);
		expect(
			await tools.execute({ toolName: 'test', toolInput: {} }, { signal: controller.signal }).then(
				() => undefined,
				(error: unknown) => error,
			),
		).toHaveProperty('name', 'AbortError');
		expect(executions).toBe(0);
	});
});

describe('LocalToolRegistry prepared execution', () => {
	test('raw execution parses once and executes normalized input with invocation options', async () => {
		let parses = 0;
		const schema = z.strictObject({
			path: z
				.string()
				.trim()
				.overwrite((value) => {
					parses++;
					return value;
				}),
			limit: z.coerce.number().default(2),
		});
		const inputs: z.output<typeof schema>[] = [];
		const receivedOptions: WorkspaceExecutionOptions[] = [];
		const registry = new LocalToolRegistry([
			defineLocalTool({
				name: 'normalized',
				description: 'Normalized',
				inputSchema: schema,
				execute: async (input, options) => {
					inputs.push(input);
					receivedOptions.push(options);
					return input;
				},
			}),
		]);
		{
			const options = { signal: new AbortController().signal };
			const result = await registry.execute(
				{ toolName: 'normalized', toolInput: { path: ' file ', limit: '3' } },
				options,
			);
			expect(parses).toBe(1);
			expect(inputs).toEqual([{ path: 'file', limit: 3 }]);
			expect(result.output).toBe(inputs[0]);
			expect(receivedOptions).toEqual([options]);
			expect(receivedOptions[0]).toBe(options);
		}
	});

	test('preparing all workspace tools performs zero workspace IO', () => {
		let io = 0;
		const registry = registryWithWorkspaceFiles(
			recordingWorkspaceFiles(() => {
				io++;
			}),
			{
				search: async () => {
					io++;
					return { returnedMatches: 0, returnedFiles: 0, matches: [], truncated: false };
				},
			},
		);
		const prepared = allWorkspaceRequests.map((request) => registry.prepare(request));
		expect(io).toBe(0);
		expect(prepared.map((execution) => execution.requiresApproval)).toEqual([
			false,
			false,
			false,
			false,
			true,
			true,
			true,
			true,
			true,
		]);
		expect(prepared.map((execution) => execution.deduplicate)).toEqual([
			true,
			true,
			false,
			true,
			false,
			false,
			false,
			false,
			false,
		]);
		expect(prepared.map((execution) => execution.invalidatesWorkspaceCache)).toEqual([
			false,
			false,
			false,
			false,
			true,
			true,
			true,
			true,
			true,
		]);
		for (const execution of prepared) expect(execution.execute).toBeFunction();
	});

	test('unknown and invalid raw requests and preparation reject before provider execution', async () => {
		let executions = 0;
		const registry = new LocalToolRegistry([
			defineLocalTool({
				name: 'known',
				description: '',
				inputSchema: z.strictObject({ path: z.string() }),
				execute: async () => {
					executions++;
					return {};
				},
			}),
		]);
		for (const [request, message] of [
			[{ toolName: 'missing', toolInput: {} }, 'Unknown tool requested by model: missing'],
			[{ toolName: 'known', toolInput: { path: 42 } }, 'Invalid arguments for tool known'],
		] as const) {
			expect(() => registry.prepare(request)).toThrow(message);
			await expect(registry.execute(request)).rejects.toThrow(message);
		}
		expect(executions).toBe(0);
	});

	test('prepared execution receives a current signal and rejects abort after preparation', async () => {
		let executions = 0;
		const received: WorkspaceExecutionOptions[] = [];
		const registry = new LocalToolRegistry([
			defineLocalTool({
				name: 'known',
				description: '',
				inputSchema: z.strictObject({}),
				execute: async (_input, options) => {
					executions++;
					received.push(options);
					return {};
				},
			}),
		]);
		const first = registry.prepare({ toolName: 'known', toolInput: {} });
		const second = registry.prepare({ toolName: 'known', toolInput: {} });
		const options = { signal: new AbortController().signal };
		await first.execute(options);
		const aborted = new AbortController();
		aborted.abort('after prepare');
		await expect(second.execute({ signal: aborted.signal })).rejects.toHaveProperty(
			'name',
			'AbortError',
		);
		expect(executions).toBe(1);
		expect(received[0]).toBe(options);
		expect(first.toolInput).toEqual({});
	});

	test('definitions are generated once and nested caller mutations cannot corrupt the cache', () => {
		let schemaReads = 0;
		const tool = defineLocalTool({
			name: 'known',
			description: 'Stable description',
			inputSchema: z.strictObject({ path: z.string() }),
			execute: async (input) => input,
		});
		const tools = [
			{
				...tool,
				get inputSchema() {
					schemaReads++;
					return tool.inputSchema;
				},
			},
		];
		const registry = new LocalToolRegistry(tools);
		expect(schemaReads).toBe(1);
		const before = registry.listTools();
		const returned = registry.listTools();
		returned[0]!.name = 'corrupt';
		returned[0]!.description = 'corrupt';
		const properties = returned[0]!.parameters['properties'] as Record<string, { type: string }>;
		properties['path']!.type = 'number';
		(returned[0]!.parameters['required'] as string[]).push('corrupt');
		returned.length = 0;
		tools.length = 0;
		expect(registry.listTools()).toEqual(before);
		expect(registry.listTools()).not.toBe(before);
		expect(schemaReads).toBe(1);
		expect(registry.prepare({ toolName: 'known', toolInput: { path: 'file' } }).toolName).toBe(
			'known',
		);
	});
});
