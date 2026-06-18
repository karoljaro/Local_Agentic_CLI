import type { WorkspaceFilePort } from '@/application/ports/WorkspaceFilePort';

export type EditWorkspaceFileInput = {
	path: string;
	oldText: string;
	newText: string;
	maxFileBytes: number;
};

export type EditWorkspaceFileOutput = {
	path: string;
	replaced: true;
	matchCount: 1;
};

export class EditWorkspaceFile {
	constructor(private readonly workspaceFiles: WorkspaceFilePort) {}

	async execute(
		input: EditWorkspaceFileInput,
	): Promise<EditWorkspaceFileOutput> {
		const file = await this.workspaceFiles.readFile({
			path: input.path,
			maxFileBytes: input.maxFileBytes,
		});
		const oldText = normalizeEscapedLineBreaks(input.oldText);
		const newText = normalizeEscapedLineBreaks(input.newText);
		const matchCount = file.content.split(oldText).length - 1;

		if (matchCount === 0) {
			throw new Error(`oldText was not found in file: ${input.path}`);
		}

		if (matchCount > 1) {
			throw new Error(
				`oldText appears multiple times in file: ${input.path}`,
			);
		}

		const writtenFile = await this.workspaceFiles.writeFile({
			path: file.path,
			content: file.content.replace(oldText, newText),
			maxFileBytes: input.maxFileBytes,
		});

		return {
			path: writtenFile.path,
			replaced: true,
			matchCount: 1,
		};
	}
}

const normalizeEscapedLineBreaks = (text: string): string =>
	text
		.replaceAll('\\r\\n', '\n')
		.replaceAll('\\n', '\n')
		.replaceAll('\\r', '\n');
