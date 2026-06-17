import type {
	ListWorkspaceFilesInput,
	WorkspaceFileList,
	WorkspaceFilePort,
} from '@/application/ports/WorkspaceFilePort';

export class ListWorkspaceFiles {
	constructor(private readonly workspaceFiles: WorkspaceFilePort) {}

	execute(input: ListWorkspaceFilesInput): Promise<WorkspaceFileList> {
		return this.workspaceFiles.listFiles(input);
	}
}
