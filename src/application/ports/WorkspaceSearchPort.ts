export type SearchWorkspaceInput = {
	query: string;
};

export type SearchWorkspaceMatch = {
	path: string;
	line: number;
	text: string;
};

export type SearchWorkspaceOutput = {
	matchCount: number;
	fileCount: number;
	matches: SearchWorkspaceMatch[];
	truncated: boolean;
};

export interface WorkspaceSearchPort {
	search(input: SearchWorkspaceInput): Promise<SearchWorkspaceOutput>;
}
