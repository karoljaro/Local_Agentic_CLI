import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ToolInputValidationError } from '@/application/ports/ToolExecutorPort';
import type {
	ReadWorkspaceFileInput,
	WorkspaceExecutionOptions,
	WriteWorkspaceFileInput,
} from '@/application/ports/WorkspaceFilePort';
import { NodeWorkspaceFileSystem } from '@/infrastructure/file-system/NodeWorkspaceFileSystem';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { LocalToolRegistry } from '../LocalToolExecutor';
import { contentVersion } from '../contentVersion';
import { replaceFileTool } from './ReplaceFileProvider';

test('malformed or missing versions fail typed validation before any provider read or write', async () => {
	const { directory, cleanup } = await createTempDirectory('phase18.1-invalid-version-');
	let reads = 0;
	let writes = 0;
	class ObservedFiles extends NodeWorkspaceFileSystem {
		override async readFile(
			input: ReadWorkspaceFileInput,
			options: WorkspaceExecutionOptions = {},
		) {
			reads++;
			return super.readFile(input, options);
		}
		override async writeFile(
			input: WriteWorkspaceFileInput,
			options: WorkspaceExecutionOptions = {},
		) {
			writes++;
			return super.writeFile(input, options);
		}
	}
	try {
		await writeFile(join(directory, 'file.ts'), 'original');
		const registry = new LocalToolRegistry([
			replaceFileTool(new ObservedFiles(directory), { maxFileBytes: 1024 }),
		]);
		for (const expectedVersion of [
			undefined,
			null,
			123,
			'',
			'invalid',
			'a'.repeat(63),
			'a'.repeat(65),
			'A'.repeat(64),
			'g'.repeat(64),
			'a'.repeat(64) + '\n',
			' ' + 'a'.repeat(64),
		]) {
			const request = {
				toolName: 'replace_file',
				toolInput: {
					path: 'file.ts',
					content: 'replacement',
					...(expectedVersion === undefined ? {} : { expectedVersion }),
				},
			};
			expect(() => registry.prepare(request)).toThrow(ToolInputValidationError);
			await expect(registry.execute(request)).rejects.toBeInstanceOf(ToolInputValidationError);
		}
		expect(reads).toBe(0);
		expect(writes).toBe(0);
		expect(await readFile(join(directory, 'file.ts'), 'utf8')).toBe('original');
	} finally {
		await cleanup();
	}
});

test('prepared whole-file replacement preserves an external change after version validation', async () => {
	const { directory, cleanup } = await createTempDirectory('phase14-replace-race-');
	const target = join(directory, 'file.ts');
	class ChangingFiles extends NodeWorkspaceFileSystem {
		override async writeFile(
			input: WriteWorkspaceFileInput,
			options: WorkspaceExecutionOptions = {},
		) {
			await writeFile(target, 'external change');
			return super.writeFile(input, options);
		}
	}
	try {
		await writeFile(target, 'original');
		const registry = new LocalToolRegistry([
			replaceFileTool(new ChangingFiles(directory), { maxFileBytes: 1024 }),
		]);
		const execution = registry.prepare({
			toolName: 'replace_file',
			toolInput: {
				path: 'file.ts',
				content: 'replacement',
				expectedVersion: contentVersion('original'),
			},
		});
		await expect(execution.execute()).rejects.toThrow('File changed since it was read');
		expect(await readFile(target, 'utf8')).toBe('external change');
	} finally {
		await cleanup();
	}
});

test('replacement cancelled after its read performs no write', async () => {
	const { directory, cleanup } = await createTempDirectory('phase14-replace-cancel-');
	const controller = new AbortController();
	let writes = 0;
	class AbortingFiles extends NodeWorkspaceFileSystem {
		override async readFile(
			input: ReadWorkspaceFileInput,
			options: WorkspaceExecutionOptions = {},
		) {
			const file = await super.readFile(input, options);
			controller.abort();
			return file;
		}
		override async writeFile(
			input: WriteWorkspaceFileInput,
			options: WorkspaceExecutionOptions = {},
		) {
			writes++;
			return super.writeFile(input, options);
		}
	}
	try {
		await writeFile(join(directory, 'file.ts'), 'original');
		const registry = new LocalToolRegistry([
			replaceFileTool(new AbortingFiles(directory), { maxFileBytes: 1024 }),
		]);
		await expect(
			registry.execute(
				{
					toolName: 'replace_file',
					toolInput: {
						path: 'file.ts',
						content: 'replacement',
						expectedVersion: contentVersion('original'),
					},
				},
				{ signal: controller.signal },
			),
		).rejects.toHaveProperty('name', 'AbortError');
		expect(writes).toBe(0);
		expect(await readFile(join(directory, 'file.ts'), 'utf8')).toBe('original');
	} finally {
		await cleanup();
	}
});
