import type { ListedModel } from '@/application/ports/ModelCatalogPort';
import type { ToolApprovalRequest } from '@/application/use-cases/RunAgentTurn';
import type { EventId, SessionId, ToolCallId } from '@/domain/Ids';

export type StartupMode = 'new' | 'resume';

export type AppScreen = 'chat' | 'models' | 'resume';

export type TurnStatus = 'idle' | 'waiting' | 'streaming';

export type HistoryEntry = {
	id: string;
	kind: 'user' | 'assistant' | 'system' | 'tool' | 'error' | 'cancelled';
	content: string;
	label?: string;
	status?: 'success' | 'failure';
};

export type ActiveTool = {
	id: ToolCallId;
	name: string;
	description: string;
	status: 'queued' | 'approval' | 'running';
};

export type ChatState = {
	sessionId: SessionId;
	history: HistoryEntry[];
	activeTools: ActiveTool[];
	loadStatus: 'loading' | 'ready';
	turnStatus: TurnStatus;
};

export type SessionOption = {
	sessionId: SessionId;
	lastActiveAt?: string;
	preview?: string;
};

export type SelectionState<TItem> = {
	status: 'idle' | 'loading' | 'submitting';
	items: TItem[];
	error?: string;
};

export type ModelSelectionState = SelectionState<ListedModel>;
export type SessionSelectionState = SelectionState<SessionOption>;

export type PendingApproval = ToolApprovalRequest;

export type CompletedAssistant = {
	eventId: EventId;
	content: string;
};
