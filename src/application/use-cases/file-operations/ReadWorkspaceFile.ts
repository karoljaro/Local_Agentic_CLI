import type {
	ReadWorkspaceFileInput,
	WorkspaceFile,
	WorkspaceFilePort,
} from '@/application/ports/WorkspaceFilePort';

export class ReadWorkspaceFile {
	constructor(private readonly workspaceFiles: WorkspaceFilePort) {}

	execute(input: ReadWorkspaceFileInput): Promise<WorkspaceFile> {
		return this.workspaceFiles.readFile(input);
	}
}
