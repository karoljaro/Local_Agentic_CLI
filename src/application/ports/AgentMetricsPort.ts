import type { SessionId } from '@/domain/Ids';

export type ToolExecutionMetric = {
	toolName: string;
	durationMs: number;
	outputCharacters: number;
	failed: boolean;
	reused: boolean;
};

export interface AgentTurnMetricsPort {
	recordModelRequest(requestCharacters: number): void;
	recordToolExecution(metric: ToolExecutionMetric): void;
	complete(): void;
}

export interface AgentMetricsPort {
	startTurn(sessionId: SessionId): AgentTurnMetricsPort;
}
