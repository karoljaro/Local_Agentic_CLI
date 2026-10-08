export type WorkspaceExecutionOptions = { signal?: AbortSignal };

export type WorkspaceFile = {
	path: string;
	content: string;
	warnings?: string[];
};

export type WorkspaceFileList = {
	files: string[];
	truncated: boolean;
};

export type ReadWorkspaceFileInput = {
	path: string;
	maxFileBytes: number;
};

export type FindWorkspaceFilesInput = {
	pattern: string;
	path?: string;
	maxEntries: number;
};

export type ListWorkspaceDirectoryInput = {
	path?: string;
	depth: number;
	maxEntries: number;
};

export type WorkspacePathType = 'file' | 'directory';

export type WorkspaceDirectoryList = {
	path: string;
	entries: { path: string; type: WorkspacePathType }[];
	truncated: boolean;
};

export type MoveWorkspaceFileInput = { source: string; destination: string };
export type WorkspaceFileMove = MoveWorkspaceFileInput & { moved: true };
export type DeleteWorkspacePathInput = { path: string };
export type WorkspacePathDeletion = { path: string; type: WorkspacePathType; deleted: true };

export type WriteWorkspaceFileInput = {
	path: string;
	content: string;
	maxFileBytes: number;
	expectedContent?: string;
};

export interface WorkspaceFilePort {
	findFiles(
		input: FindWorkspaceFilesInput,
		options?: WorkspaceExecutionOptions,
	): Promise<WorkspaceFileList>;
	listDirectory(
		input: ListWorkspaceDirectoryInput,
		options?: WorkspaceExecutionOptions,
	): Promise<WorkspaceDirectoryList>;
	readFile(
		input: ReadWorkspaceFileInput,
		options?: WorkspaceExecutionOptions,
	): Promise<WorkspaceFile>;
	writeFile(
		input: WriteWorkspaceFileInput,
		options?: WorkspaceExecutionOptions,
	): Promise<WorkspaceFile>;
	createFile(
		input: WriteWorkspaceFileInput,
		options?: WorkspaceExecutionOptions,
	): Promise<WorkspaceFile>;
	moveFile(
		input: MoveWorkspaceFileInput,
		options?: WorkspaceExecutionOptions,
	): Promise<WorkspaceFileMove>;
	deletePath(
		input: DeleteWorkspacePathInput,
		options?: WorkspaceExecutionOptions,
	): Promise<WorkspacePathDeletion>;
}
