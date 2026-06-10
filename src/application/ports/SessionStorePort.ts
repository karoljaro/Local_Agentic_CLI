import type { AgentEvent } from "@/domain/AgentEvent";
import type { SessionId } from "@/domain/Ids";

export type StoredSession = {
	sessionId: SessionId;
};

export interface SessionStorePort {
	listSessions(): Promise<StoredSession[]>;
	readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]>;
	appendSessionEvent(event: AgentEvent): Promise<void>;
}
