export type WorkspaceExecutionOptions = { signal?: AbortSignal };

export type WorkspaceFile = {
	path: string;
	content: string;
};

export type WorkspaceFileList = {
	files: string[];
	truncated: boolean;
};

export type ReadWorkspaceFileInput = {
	path: string;
	maxFileBytes: number;
};

export type ListWorkspaceFilesInput = {
	path?: string;
	maxEntries: number;
};

export type WriteWorkspaceFileInput = {
	path: string;
	content: string;
	maxFileBytes: number;
	expectedContent?: string;
};

export interface WorkspaceFilePort {
	listFiles(
		input: ListWorkspaceFilesInput,
		options?: WorkspaceExecutionOptions,
	): Promise<WorkspaceFileList>;
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
}
