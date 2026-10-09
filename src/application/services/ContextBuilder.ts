import type { AgentState } from '@/domain/AgentState';
import type { MessageId } from '@/domain/Ids';
import {
	validateModelContextProfile,
	type ModelContextProfile,
} from '@/domain/ModelContextProfile';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ToolDefinition } from '@/domain/Tool';
import {
	ESTIMATED_REQUEST_FRAMING_TOKENS,
	estimateMessageTokens,
	estimateToolTokens,
} from './ModelRequestEstimator';

type ContextBuilderOptions = {
	systemPrompt: string;
	contextProfile: ModelContextProfile;
};

export type ContextDiagnostics = {
	contextWindowTokens: number;
	maxOutputTokens: number;
	safetyAllowanceTokens: number;
	estimatedInputLimitTokens: number;
	estimatedFixedTokens: number;
	estimatedActiveTurnTokens: number;
	estimatedSelectedHistoryTokens: number;
	estimatedInputTokens: number;
	selectedCompletedTurns: number;
	droppedCompletedTurns: number;
	estimatedRemainingMarginTokens: number;
};

export type CompiledContext = {
	messages: ModelMessage[];
	tools: ToolDefinition[];
	contextProfile: ModelContextProfile;
	diagnostics: ContextDiagnostics;
};

export class ContextBudgetExceededError extends Error {
	constructor(readonly diagnostics: ContextDiagnostics) {
		super(
			`The active request itself exceeds the configured model context budget ` +
				`(${diagnostics.contextWindowTokens} tokens total, ${diagnostics.maxOutputTokens} reserved for output, ` +
				`${diagnostics.safetyAllowanceTokens} safety allowance; estimated input ${diagnostics.estimatedInputTokens} tokens).`,
		);
		this.name = 'ContextBudgetExceededError';
	}
}

/** Bounded Context Compiler. History assembly remains exclusively in SessionReducer. */
export class ContextBuilder {
	private readonly systemMessage: ModelMessage;
	private readonly contextProfile: ModelContextProfile;

	constructor(options: ContextBuilderOptions) {
		validateModelContextProfile(options.contextProfile);
		this.contextProfile = Object.freeze({ ...options.contextProfile });
		this.systemMessage = { role: 'system', content: options.systemPrompt };
	}

	assertPromptFits(prompt: string, messageId: MessageId, tools: ToolDefinition[] = []): void {
		this.compile([{ role: 'user', content: prompt, id: messageId }], tools);
	}

	build(state: AgentState, tools: ToolDefinition[] = []): CompiledContext {
		return this.compile(state.messages, tools);
	}

	private compile(history: ModelMessage[], tools: ToolDefinition[]): CompiledContext {
		const turns = groupMessagesIntoTurns(history);
		const safetyAllowanceTokens = Math.max(
			128,
			Math.ceil(this.contextProfile.contextWindowTokens / 16),
		);
		const estimatedInputLimitTokens =
			this.contextProfile.contextWindowTokens -
			this.contextProfile.maxOutputTokens -
			safetyAllowanceTokens;
		const estimatedFixedTokens =
			ESTIMATED_REQUEST_FRAMING_TOKENS +
			estimateMessageTokens(this.systemMessage) +
			tools.reduce((total, tool) => total + estimateToolTokens(tool), 0);
		const activeTurn = turns.at(-1) ?? [];
		const estimatedActiveTurnTokens = measureTurn(activeTurn);
		let estimatedSelectedHistoryTokens = 0;
		let firstSelectedTurn = Math.max(0, turns.length - 1);
		const completedTurns = Math.max(0, turns.length - 1);
		let selectedCompletedTurns = 0;
		const diagnostics = (): ContextDiagnostics => {
			const estimatedInputTokens =
				estimatedFixedTokens + estimatedActiveTurnTokens + estimatedSelectedHistoryTokens;
			return {
				...this.contextProfile,
				safetyAllowanceTokens,
				estimatedInputLimitTokens,
				estimatedFixedTokens,
				estimatedActiveTurnTokens,
				estimatedSelectedHistoryTokens,
				estimatedInputTokens,
				selectedCompletedTurns,
				droppedCompletedTurns: completedTurns - selectedCompletedTurns,
				estimatedRemainingMarginTokens: estimatedInputLimitTokens - estimatedInputTokens,
			};
		};
		if (estimatedFixedTokens + estimatedActiveTurnTokens > estimatedInputLimitTokens) {
			throw new ContextBudgetExceededError(diagnostics());
		}
		for (let index = turns.length - 2; index >= 0; index -= 1) {
			const turnCost = measureTurn(turns[index]!);
			if (
				estimatedFixedTokens +
					estimatedActiveTurnTokens +
					estimatedSelectedHistoryTokens +
					turnCost >
				estimatedInputLimitTokens
			)
				break;
			estimatedSelectedHistoryTokens += turnCost;
			selectedCompletedTurns += 1;
			firstSelectedTurn = index;
		}
		return {
			messages: [this.systemMessage, ...turns.slice(firstSelectedTurn).flat()],
			tools,
			contextProfile: this.contextProfile,
			diagnostics: diagnostics(),
		};
	}
}

const groupMessagesIntoTurns = (messages: ModelMessage[]): ModelMessage[][] => {
	const turns: ModelMessage[][] = [];
	for (const message of messages) {
		if (message.role === 'system')
			throw new Error('Canonical model history must not contain system instructions.');
		if (message.role === 'user' || turns.length === 0) turns.push([message]);
		else turns.at(-1)!.push(message);
	}
	return turns;
};

const measureTurn = (turn: ModelMessage[]): number =>
	turn.reduce((total, message) => total + estimateMessageTokens(message), 0);
