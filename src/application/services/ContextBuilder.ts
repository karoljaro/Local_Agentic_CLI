import type { AgentState } from '@/domain/AgentState';
import type { MessageId } from '@/domain/Ids';
import {
	validateModelContextProfile,
	type ModelContextProfile,
} from '@/domain/ModelContextProfile';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ToolDefinition } from '@/domain/Tool';
import { MEMORY_TOKEN_CAP, type SessionMemory } from '@/domain/SessionMemory';
import { renderSessionMemory } from './SessionMemoryRenderer';
import type { HistoryRetrieval } from './HistoryRetriever';
import { groupMessagesIntoTurns, isRetrievableTurn } from './HistoryTurns';
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
	estimatedMemoryTokens: number;
	selectedMemoryItems: number;
	droppedMemoryItems: number;
	estimatedInputTokens: number;
	selectedCompletedTurns: number;
	droppedCompletedTurns: number;
	estimatedRemainingMarginTokens: number;
	retrievalEnabled: boolean;
	historicalCandidatesConsidered: number;
	retrievedTurnCount: number;
	retrievedEstimatedTokens: number;
	skippedOversizedCandidates: number;
	retrievalFallbackReason?: HistoryRetrieval['fallbackReason'];
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

	build(
		state: AgentState,
		tools: ToolDefinition[] = [],
		retrieval?: HistoryRetrieval,
		memory?: SessionMemory,
	): CompiledContext {
		return this.compile(state.messages, tools, retrieval, memory);
	}

	private compile(
		history: ModelMessage[],
		tools: ToolDefinition[],
		retrieval?: HistoryRetrieval,
		memory?: SessionMemory,
	): CompiledContext {
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
		let renderedMemory = renderSessionMemory(this.systemMessage.content, undefined);
		let estimatedSelectedHistoryTokens = 0;
		let firstSelectedTurn = Math.max(0, turns.length - 1);
		const completedTurns = Math.max(0, turns.length - 1);
		let selectedCompletedTurns = 0;
		let retrievedTurnCount = 0;
		let retrievedEstimatedTokens = 0;
		let skippedOversizedCandidates = 0;
		const selectedIndices = new Set<number>();
		const semantic = retrieval !== undefined && retrieval.fallbackReason === undefined;
		const diagnostics = (): ContextDiagnostics => {
			const estimatedInputTokens =
				estimatedFixedTokens +
				estimatedActiveTurnTokens +
				renderedMemory.tokens +
				estimatedSelectedHistoryTokens;
			return {
				...this.contextProfile,
				safetyAllowanceTokens,
				estimatedInputLimitTokens,
				estimatedFixedTokens,
				estimatedActiveTurnTokens,
				estimatedSelectedHistoryTokens,
				estimatedMemoryTokens: renderedMemory.tokens,
				selectedMemoryItems: renderedMemory.selected.length,
				droppedMemoryItems: renderedMemory.droppedItems,
				estimatedInputTokens,
				selectedCompletedTurns,
				droppedCompletedTurns: completedTurns - selectedCompletedTurns,
				estimatedRemainingMarginTokens: estimatedInputLimitTokens - estimatedInputTokens,
				retrievalEnabled: retrieval?.enabled ?? false,
				historicalCandidatesConsidered: retrieval?.candidatesConsidered ?? 0,
				retrievedTurnCount,
				retrievedEstimatedTokens,
				skippedOversizedCandidates,
				...(retrieval?.fallbackReason === undefined
					? {}
					: { retrievalFallbackReason: retrieval.fallbackReason }),
			};
		};
		if (estimatedFixedTokens + estimatedActiveTurnTokens > estimatedInputLimitTokens) {
			throw new ContextBudgetExceededError(diagnostics());
		}
		renderedMemory = renderSessionMemory(
			this.systemMessage.content,
			memory,
			Math.min(
				MEMORY_TOKEN_CAP,
				Math.floor(estimatedInputLimitTokens / 8),
				estimatedInputLimitTokens - estimatedFixedTokens - estimatedActiveTurnTokens,
			),
		);
		for (
			let index = turns.length - 2;
			index >= (semantic ? Math.max(0, turns.length - 2) : 0);
			index -= 1
		) {
			const turnCost = measureTurn(turns[index]!);
			if (
				estimatedFixedTokens +
					estimatedActiveTurnTokens +
					renderedMemory.tokens +
					estimatedSelectedHistoryTokens +
					turnCost >
				estimatedInputLimitTokens
			)
				break;
			estimatedSelectedHistoryTokens += turnCost;
			selectedCompletedTurns += 1;
			firstSelectedTurn = index;
			selectedIndices.add(index);
		}
		if (semantic) {
			const byId = new Map<string, number>();
			for (let index = 0; index < turns.length - 2; index++) {
				const turn = turns[index]!;
				if (isRetrievableTurn(turn)) byId.set(turn[0]!.id!, index);
			}
			const seen = new Set<string>();
			for (const candidate of retrieval.candidates) {
				if (retrievedTurnCount >= 3) break;
				if (seen.has(candidate.turnId)) continue;
				seen.add(candidate.turnId);
				const index = byId.get(candidate.turnId);
				if (index === undefined || selectedIndices.has(index)) continue;
				const cost = measureTurn(turns[index]!);
				if (
					estimatedFixedTokens +
						estimatedActiveTurnTokens +
						renderedMemory.tokens +
						estimatedSelectedHistoryTokens +
						cost >
					estimatedInputLimitTokens
				) {
					skippedOversizedCandidates++;
					continue;
				}
				selectedIndices.add(index);
				estimatedSelectedHistoryTokens += cost;
				retrievedEstimatedTokens += cost;
				retrievedTurnCount++;
				selectedCompletedTurns++;
			}
		}
		const selectedHistory = semantic
			? [...selectedIndices].sort((a, b) => a - b).flatMap((index) => turns[index]!)
			: turns.slice(firstSelectedTurn, -1).flat();
		return {
			messages: [
				{ role: 'system', content: renderedMemory.content },
				...selectedHistory,
				...activeTurn,
			],
			tools,
			contextProfile: this.contextProfile,
			diagnostics: diagnostics(),
		};
	}
}

const measureTurn = (turn: ModelMessage[]): number =>
	turn.reduce((total, message) => total + estimateMessageTokens(message), 0);
