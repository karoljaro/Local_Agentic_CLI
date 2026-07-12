export type SearchWorkspaceInput = {
	query: string;
};

export type SearchWorkspaceMatch = {
	path: string;
	line: number;
	text: string;
};

export type SearchWorkspaceOutput = {
	returnedMatches: number;
	returnedFiles: number;
	matches: SearchWorkspaceMatch[];
	truncated: boolean;
};

export interface WorkspaceSearchPort {
	search(input: SearchWorkspaceInput): Promise<SearchWorkspaceOutput>;
}
