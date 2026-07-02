import { describe, expect, test } from 'bun:test';

import type {
	ListWorkspaceFilesInput,
	ReadWorkspaceFileInput,
	WorkspaceFile,
	WorkspaceFileList,
	WorkspaceFilePort,
	WriteWorkspaceFileInput,
} from '@/application/ports/WorkspaceFilePort';
import { EditWorkspaceFile } from './EditWorkspaceFile';

class RecordingWorkspaceFilePort implements WorkspaceFilePort {
	writeInput: WriteWorkspaceFileInput | undefined;

	async listFiles(
		_input: ListWorkspaceFilesInput
	): Promise<WorkspaceFileList> {
		throw new Error('not used');
	}

	async readFile(_input: ReadWorkspaceFileInput): Promise<WorkspaceFile> {
		return {
			path: 'file.txt',
			content: 'before target after',
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
