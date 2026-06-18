import type {
	SearchWorkspaceInput,
	SearchWorkspaceOutput,
	WorkspaceSearchPort,
} from '@/application/ports/WorkspaceSearchPort';

export class SearchWorkspaceFiles {
	constructor(private readonly workspaceSearch: WorkspaceSearchPort) {}

	execute(input: SearchWorkspaceInput): Promise<SearchWorkspaceOutput> {
		return this.workspaceSearch.search(input);
	}
}
