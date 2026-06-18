import type {
	WorkspaceFile,
	WorkspaceFilePort,
	WriteWorkspaceFileInput,
} from '@/application/ports/WorkspaceFilePort';

export class CreateWorkspaceFile {
	constructor(private readonly workspaceFilePort: WorkspaceFilePort) {}

	execute(input: WriteWorkspaceFileInput): Promise<WorkspaceFile> {
		return this.workspaceFilePort.createFile(input);
	}
}
