export type WorkspaceFile = {
	path: string;
	content: string;
};

export type ReadWorkspaceFileInput = {
	path: string;
	maxFileBytes: number;
};

export interface WorkspaceFilePort {
	readFile(input: ReadWorkspaceFileInput): Promise<WorkspaceFile>;
}
