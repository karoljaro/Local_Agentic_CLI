import type {
	SessionStorePort,
	StoredSession,
} from '../ports/SessionStorePort';

export type ListSessionsResult = {
	sessions: StoredSession[];
};

export type ListSessionsDependencies = {
	sessionStore: SessionStorePort;
};

export class ListSessions {
	constructor(private readonly dependencies: ListSessionsDependencies) {}

	async list(): Promise<ListSessionsResult> {
		const sessions = await this.dependencies.sessionStore.listSessions();
		return { sessions };
	}
}
