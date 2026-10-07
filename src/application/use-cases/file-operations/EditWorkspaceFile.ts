import { throwIfAborted } from '@/application/services/cancellation';
import type {
	WorkspaceExecutionOptions,
	WorkspaceFilePort,
} from '@/application/ports/WorkspaceFilePort';

type EditWorkspaceFileInput = {
	path: string;
	oldText: string;
	newText: string;
	maxFileBytes: number;
};

type EditWorkspaceFileOutput = {
	path: string;
	replaced: true;
	matchCount: 1;
};

export class EditWorkspaceFile {
	constructor(private readonly workspaceFiles: WorkspaceFilePort) {}

	async execute(
		input: EditWorkspaceFileInput,
		options: WorkspaceExecutionOptions = {},
	): Promise<EditWorkspaceFileOutput> {
		throwIfAborted(options.signal);
		const file = await this.workspaceFiles.readFile(
			{
				path: input.path,
				maxFileBytes: input.maxFileBytes,
			},
			options,
		);
		throwIfAborted(options.signal);
		const matchCount = file.content.split(input.oldText).length - 1;

		if (matchCount === 0) {
			throw new Error(`oldText was not found in file: ${input.path}`);
		}

		if (matchCount > 1) {
			throw new Error(`oldText appears multiple times in file: ${input.path}`);
		}

		throwIfAborted(options.signal);
		const writtenFile = await this.workspaceFiles.writeFile(
			{
				path: file.path,
				content: file.content.replace(input.oldText, () => input.newText),
				maxFileBytes: input.maxFileBytes,
				expectedContent: file.content,
			},
			options,
		);

		return {
			path: writtenFile.path,
			replaced: true,
			matchCount: 1,
		};
	}
}
