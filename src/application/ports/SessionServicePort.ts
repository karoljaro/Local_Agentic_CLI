import type { AgentEvent } from '@/domain/AgentEvent';
import type { AgentState } from '@/domain/AgentState';
import type { SessionId } from '@/domain/Ids';
import type { SessionStorePort } from './SessionStorePort';

export interface SessionServicePort extends SessionStorePort {
	readSessionState(sessionId: SessionId): Promise<AgentState>;
	readPreviewEvents(sessionId: SessionId): Promise<AgentEvent[]>;
	activateSession(sessionId: SessionId): Promise<AgentEvent[]>;
	subscribe(listener: (event: AgentEvent) => void): () => void;
}
