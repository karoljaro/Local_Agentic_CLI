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
};

export interface WorkspaceFilePort {
	listFiles(input: ListWorkspaceFilesInput): Promise<WorkspaceFileList>;
	readFile(input: ReadWorkspaceFileInput): Promise<WorkspaceFile>;
	writeFile(input: WriteWorkspaceFileInput): Promise<WorkspaceFile>;
	createFile(input: WriteWorkspaceFileInput): Promise<WorkspaceFile>;
}
