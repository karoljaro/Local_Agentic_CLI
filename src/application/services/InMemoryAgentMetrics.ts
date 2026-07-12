import type {
	AgentMetricsPort,
	AgentTurnMetricsPort,
	ToolExecutionMetric,
} from '@/application/ports/AgentMetricsPort';
import type { SessionId } from '@/domain/Ids';

const DEFAULT_MAX_COMPLETED_TURNS = 100;

type ValueMetrics = {
	total: number;
	max: number;
};

type ToolMetricAggregate = {
	executions: number;
	failed: number;
	reused: number;
	outputCharacters: ValueMetrics;
	durationMs: ValueMetrics;
};

type ToolMetrics = ToolMetricAggregate & {
	byTool: Record<string, ToolMetricAggregate>;
};

export type AgentTurnMetricsSnapshot = {
	sessionId: SessionId;
	modelRounds: number;
	modelRequestCharacters: ValueMetrics;
	tools: ToolMetrics;
};

export type AgentMetricsSnapshot = {
	completedTurns: AgentTurnMetricsSnapshot[];
};

export class InMemoryAgentMetrics implements AgentMetricsPort {
	private readonly completedTurns: AgentTurnMetricsSnapshot[] = [];

	constructor(private readonly maxCompletedTurns = DEFAULT_MAX_COMPLETED_TURNS) {
		if (!Number.isInteger(maxCompletedTurns) || maxCompletedTurns <= 0) {
			throw new Error('Max completed metric turns must be a positive integer.');
		}
	}

	startTurn(sessionId: SessionId): AgentTurnMetricsPort {
		return new TurnMetricsRecorder(sessionId, (metrics) => {
			this.completedTurns.push(metrics);

			if (this.completedTurns.length > this.maxCompletedTurns) {
				this.completedTurns.splice(0, this.completedTurns.length - this.maxCompletedTurns);
			}
		});
	}

	snapshot(sessionId?: SessionId): AgentMetricsSnapshot {
		return {
			completedTurns: this.completedTurns
				.filter((turn) => sessionId === undefined || turn.sessionId === sessionId)
				.map(cloneTurnMetrics),
		};
	}
}

class TurnMetricsRecorder implements AgentTurnMetricsPort {
	private readonly metrics: AgentTurnMetricsSnapshot;
	private completed = false;

	constructor(
		sessionId: SessionId,
		private readonly onComplete: (metrics: AgentTurnMetricsSnapshot) => void,
	) {
		this.metrics = {
			sessionId,
			modelRounds: 0,
			modelRequestCharacters: createValueMetrics(),
			tools: { ...createToolMetricAggregate(), byTool: {} },
		};
	}

	recordModelRequest(requestCharacters: number): void {
		if (this.completed) {
			return;
		}

		this.metrics.modelRounds += 1;
		addValue(this.metrics.modelRequestCharacters, requestCharacters);
	}

	recordToolExecution(metric: ToolExecutionMetric): void {
		if (this.completed) {
			return;
		}

		this.metrics.tools.executions += 1;
		this.metrics.tools.failed += metric.failed ? 1 : 0;
		this.metrics.tools.reused += metric.reused ? 1 : 0;
		addValue(this.metrics.tools.outputCharacters, metric.outputCharacters);
		addValue(this.metrics.tools.durationMs, metric.durationMs);

		const toolMetrics = (this.metrics.tools.byTool[metric.toolName] ??=
			createToolMetricAggregate());
		toolMetrics.executions += 1;
		toolMetrics.failed += metric.failed ? 1 : 0;
		toolMetrics.reused += metric.reused ? 1 : 0;
		addValue(toolMetrics.outputCharacters, metric.outputCharacters);
		addValue(toolMetrics.durationMs, metric.durationMs);
	}

	complete(): void {
		if (this.completed) {
			return;
		}

		this.completed = true;
		this.onComplete(cloneTurnMetrics(this.metrics));
	}
}

const createValueMetrics = (): ValueMetrics => ({ total: 0, max: 0 });

const createToolMetricAggregate = (): ToolMetricAggregate => ({
	executions: 0,
	failed: 0,
	reused: 0,
	outputCharacters: createValueMetrics(),
	durationMs: createValueMetrics(),
});

const addValue = (metrics: ValueMetrics, value: number): void => {
	const normalizedValue = Number.isFinite(value) ? Math.max(0, value) : 0;
	metrics.total += normalizedValue;
	metrics.max = Math.max(metrics.max, normalizedValue);
};

const cloneTurnMetrics = (metrics: AgentTurnMetricsSnapshot): AgentTurnMetricsSnapshot => ({
	sessionId: metrics.sessionId,
	modelRounds: metrics.modelRounds,
	modelRequestCharacters: { ...metrics.modelRequestCharacters },
	tools: {
		...metrics.tools,
		outputCharacters: { ...metrics.tools.outputCharacters },
		durationMs: { ...metrics.tools.durationMs },
		byTool: Object.fromEntries(
			Object.entries(metrics.tools.byTool).map(([toolName, toolMetrics]) => [
				toolName,
				{
					...toolMetrics,
					outputCharacters: { ...toolMetrics.outputCharacters },
					durationMs: { ...toolMetrics.durationMs },
				},
			]),
		),
	},
});
