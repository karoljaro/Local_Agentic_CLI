import type { AgentEvent } from "@/domain/AgentEvent";
import type { SessionId } from "@/domain/Ids";

export interface SessionStorePort {
	readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]>;
	appendSessionEvent(event: AgentEvent): Promise<void>;
}
