import type { AgentState } from '@/domain/AgentState';
import type { MessageId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';

type ContextBuilderOptions = {
	systemPrompt: string;
	maxContextCharacters?: number;
};

type BuildContextResult = {
	messages: ModelMessage[];
};

const DEFAULT_MAX_CONTEXT_CHARACTERS = 120_000;

export class ContextBudgetExceededError extends Error {
	constructor(maxContextCharacters: number) {
		super(`Current turn exceeds the model context budget of ${maxContextCharacters} characters.`);
		this.name = 'ContextBudgetExceededError';
	}
}

export class ContextBuilder {
	private readonly systemMessage: ModelMessage;
	private readonly maxContextCharacters: number;

	constructor(options: ContextBuilderOptions) {
		this.maxContextCharacters = options.maxContextCharacters ?? DEFAULT_MAX_CONTEXT_CHARACTERS;

		if (!Number.isInteger(this.maxContextCharacters) || this.maxContextCharacters <= 0) {
			throw new Error('Model context character budget must be a positive integer.');
		}

		this.systemMessage = {
			role: 'system',
			content: options.systemPrompt,
		};

		if (measureMessages([this.systemMessage]) > this.maxContextCharacters) {
			throw new ContextBudgetExceededError(this.maxContextCharacters);
		}
	}

	assertPromptFits(prompt: string, messageId: MessageId): void {
		this.fit([
			this.systemMessage,
			{
				role: 'user',
				content: prompt,
				id: messageId,
			},
		]);
	}

	build(state: AgentState): BuildContextResult {
		return {
			messages: this.fit([this.systemMessage, ...state.messages]),
		};
	}

	fit(messages: ModelMessage[]): ModelMessage[] {
		const systemMessages = messages.filter((message) => message.role === 'system');
		const conversationMessages = messages.filter((message) => message.role !== 'system');
		const turns = groupMessagesIntoTurns(conversationMessages);

		if (turns.length === 0) {
			return ensureWithinBudget(systemMessages, this.maxContextCharacters);
		}

		const currentTurn = turns.at(-1) ?? [];
		const selectedTurns: ModelMessage[][] = [currentTurn];
		const mandatoryMessages = [...systemMessages, ...currentTurn];

		ensureWithinBudget(mandatoryMessages, this.maxContextCharacters);

		for (let index = turns.length - 2; index >= 0; index -= 1) {
			const turn = turns[index];

			if (turn === undefined) {
				continue;
			}

			const candidateTurns = [turn, ...selectedTurns];
			const candidateMessages = [...systemMessages, ...candidateTurns.flat()];

			if (measureMessages(candidateMessages) > this.maxContextCharacters) {
				break;
			}

			selectedTurns.unshift(turn);
		}

		return [...systemMessages, ...selectedTurns.flat()];
	}
}

const groupMessagesIntoTurns = (messages: ModelMessage[]): ModelMessage[][] => {
	const turns: ModelMessage[][] = [];

	for (const message of messages) {
		if (message.role === 'user' || turns.length === 0) {
			turns.push([message]);
			continue;
		}

		turns.at(-1)?.push(message);
	}

	return turns;
};

const ensureWithinBudget = (
	messages: ModelMessage[],
	maxContextCharacters: number,
): ModelMessage[] => {
	if (measureMessages(messages) > maxContextCharacters) {
		throw new ContextBudgetExceededError(maxContextCharacters);
	}

	return messages;
};

const measureMessages = (messages: ModelMessage[]): number => JSON.stringify(messages).length;
