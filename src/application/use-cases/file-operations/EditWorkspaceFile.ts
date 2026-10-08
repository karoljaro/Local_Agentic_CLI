import { throwIfAborted } from '@/application/services/cancellation';
import type {
	WorkspaceExecutionOptions,
	WorkspaceFilePort,
} from '@/application/ports/WorkspaceFilePort';

type EditWorkspaceFileInput = {
	path: string;
	edits: { oldText: string; newText: string }[];
	maxFileBytes: number;
};

type EditWorkspaceFileOutput = {
	path: string;
	changed: boolean;
	editsApplied: number;
};

export class EditWorkspaceFile {
	constructor(private readonly workspaceFiles: WorkspaceFilePort) {}

	async execute(
		input: EditWorkspaceFileInput,
		options: WorkspaceExecutionOptions = {},
	): Promise<EditWorkspaceFileOutput> {
		throwIfAborted(options.signal);
		if (
			input.edits.length === 0 ||
			input.edits.length > 50 ||
			input.edits.some((edit) => edit.oldText.length === 0)
		) {
			throw new Error('Provide 1–50 edits with nonempty oldText.');
		}
		const file = await this.workspaceFiles.readFile(
			{
				path: input.path,
				maxFileBytes: input.maxFileBytes,
			},
			options,
		);
		throwIfAborted(options.signal);
		// Locate all edits in the original content, including overlapping occurrences.
		const changes = input.edits
			.map((edit, index) => {
				const start = file.content.indexOf(edit.oldText);
				if (start === -1) {
					throw new Error(
						`oldText was not found in file: ${input.path} (edit ${index + 1}). Read it again and include exact context.`,
					);
				}
				if (file.content.indexOf(edit.oldText, start + 1) !== -1) {
					throw new Error(
						`oldText appears multiple times in file: ${input.path} (edit ${index + 1}). Include more context.`,
					);
				}
				return { start, end: start + edit.oldText.length, newText: edit.newText };
			})
			.sort((a, b) => a.start - b.start);
		let previousEnd = 0;
		let content = '';
		for (const change of changes) {
			if (change.start < previousEnd) {
				throw new Error(
					`Edits overlap in file: ${input.path}. Combine overlapping changes into one edit.`,
				);
			}
			content += file.content.slice(previousEnd, change.start) + change.newText;
			previousEnd = change.end;
		}
		content += file.content.slice(previousEnd);

		throwIfAborted(options.signal);
		if (content === file.content) {
			return { path: file.path, changed: false, editsApplied: input.edits.length };
		}
		const writtenFile = await this.workspaceFiles.writeFile(
			{
				path: file.path,
				content,
				maxFileBytes: input.maxFileBytes,
				expectedContent: file.content,
			},
			options,
		);

		return {
			path: writtenFile.path,
			changed: true,
			editsApplied: input.edits.length,
		};
	}
}
