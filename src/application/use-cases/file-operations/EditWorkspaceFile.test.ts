import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type {
	ListWorkspaceFilesInput,
	ReadWorkspaceFileInput,
	WorkspaceExecutionOptions,
	WorkspaceFile,
	WorkspaceFileList,
	WorkspaceFilePort,
	WriteWorkspaceFileInput,
} from '@/application/ports/WorkspaceFilePort';
import { NodeWorkspaceFileSystem } from '@/infrastructure/file-system/NodeWorkspaceFileSystem';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { EditWorkspaceFile } from './EditWorkspaceFile';

class RecordingWorkspaceFilePort implements WorkspaceFilePort {
	writeInput: WriteWorkspaceFileInput | undefined;

	constructor(private readonly content = 'before target after') {}

	async listFiles(_input: ListWorkspaceFilesInput): Promise<WorkspaceFileList> {
		throw new Error('not used');
	}

	async readFile(_input: ReadWorkspaceFileInput): Promise<WorkspaceFile> {
		return {
			path: 'file.txt',
			content: this.content,
		};
	}

	async writeFile(input: WriteWorkspaceFileInput): Promise<WorkspaceFile> {
		this.writeInput = input;

		return {
			path: input.path,
			content: input.content,
		};
	}

	async createFile(input: WriteWorkspaceFileInput): Promise<WorkspaceFile> {
		throw new Error(`not used: ${input.path}`);
	}
}

describe('EditWorkspaceFile', () => {
	test.each([
		'$&',
		'$$',
		'$`',
		"$'",
		'replacement',
		'',
	])('writes replacement text literally: %j', async (newText) => {
		const workspaceFiles = new RecordingWorkspaceFilePort();
		await new EditWorkspaceFile(workspaceFiles).execute({
			path: 'file.txt',
			oldText: 'target',
			newText,
			maxFileBytes: 1024,
		});

		expect(workspaceFiles.writeInput).toEqual({
			path: 'file.txt',
			content: `before ${newText} after`,
			expectedContent: 'before target after',
			maxFileBytes: 1024,
		});
	});

	test.each([
		['no match', 'oldText was not found'],
		['target and target', 'oldText appears multiple times'],
	])('rejects non-unique matches without writing: %j', async (content, error) => {
		const workspaceFiles = new RecordingWorkspaceFilePort(content);

		await expect(
			new EditWorkspaceFile(workspaceFiles).execute({
				path: 'file.txt',
				oldText: 'target',
				newText: '$&',
				maxFileBytes: 1024,
			}),
		).rejects.toThrow(error);
		expect(workspaceFiles.writeInput).toBeUndefined();
	});

	test('rejects content changed between the edit read and write', async () => {
		const { directory, cleanup } = await createTempDirectory('stale-edit-');
		const path = join(directory, 'file.txt');
		class ChangingWorkspaceFileSystem extends NodeWorkspaceFileSystem {
			override async readFile(input: ReadWorkspaceFileInput): Promise<WorkspaceFile> {
				const file = await super.readFile(input);
				await writeFile(path, 'changed elsewhere', 'utf8');
				return file;
			}
		}

		try {
			await writeFile(path, 'before target after', 'utf8');
			await expect(
				new EditWorkspaceFile(new ChangingWorkspaceFileSystem(directory)).execute({
					path: 'file.txt',
					oldText: 'target',
					newText: '$&',
					maxFileBytes: 1024,
				}),
			).rejects.toThrow('File changed since it was read');
			await expect(readFile(path, 'utf8')).resolves.toBe('changed elsewhere');
		} finally {
			await cleanup();
		}
	});

	test('writes with the content that was read as the expected content', async () => {
		const workspaceFiles = new RecordingWorkspaceFilePort();
		const editWorkspaceFile = new EditWorkspaceFile(workspaceFiles);

		await editWorkspaceFile.execute({
			path: 'file.txt',
			oldText: 'target',
			newText: 'replacement',
			maxFileBytes: 1024,
		});

		expect(workspaceFiles.writeInput).toMatchObject({
			path: 'file.txt',
			content: 'before replacement after',
			expectedContent: 'before target after',
			maxFileBytes: 1024,
		});
	});
});

describe('EditWorkspaceFile cooperative cancellation', () => {
	test('abort after reading prevents write and passes the same execution options separately', async () => {
		const controller = new AbortController();
		const options = { signal: controller.signal };
		const files = new RecordingWorkspaceFilePort();
		let reads = 0;
		files.readFile = async (_input, received?: WorkspaceExecutionOptions) => {
			reads++;
			expect(received).toBe(options);
			controller.abort();
			return { path: 'file.txt', content: 'before target after' };
		};
		expect(
			await new EditWorkspaceFile(files)
				.execute(
					{ path: 'file.txt', oldText: 'target', newText: '$&', maxFileBytes: 1024 },
					options,
				)
				.then(
					() => undefined,
					(error: unknown) => error,
				),
		).toHaveProperty('name', 'AbortError');
		expect(reads).toBe(1);
		expect(files.writeInput).toBeUndefined();
	});

	test('write that has started completes truthfully after cancellation', async () => {
		const controller = new AbortController();
		const options = { signal: controller.signal };
		const files = new RecordingWorkspaceFilePort();
		files.writeFile = async (input, received?: WorkspaceExecutionOptions) => {
			expect(received).toBe(options);
			controller.abort();
			files.writeInput = input;
			return { path: input.path, content: input.content };
		};
		await expect(
			new EditWorkspaceFile(files).execute(
				{ path: 'file.txt', oldText: 'target', newText: '$&', maxFileBytes: 1024 },
				options,
			),
		).resolves.toMatchObject({ replaced: true });
		expect(files.writeInput?.content).toBe('before $& after');
		expect(files.writeInput).not.toHaveProperty('signal');
	});
});
