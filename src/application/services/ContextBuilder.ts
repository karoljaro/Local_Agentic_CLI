import type { AgentState } from '@/domain/AgentState';
import type { MessageId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';

type ContextBuilderOptions = {
	systemPrompt: string;
	maxContextCharacters: number;
};

type BuildContextResult = {
	messages: ModelMessage[];
};

type MessageGroupSize = {
	serializedCharacters: number;
	messageCount: number;
};

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
		this.maxContextCharacters = options.maxContextCharacters;

		if (!Number.isInteger(this.maxContextCharacters) || this.maxContextCharacters <= 0) {
			throw new Error('Model context character budget must be a positive integer.');
		}

		this.systemMessage = {
			role: 'system',
			content: options.systemPrompt,
		};

		ensureWithinBudget(measureMessages([this.systemMessage]), this.maxContextCharacters);
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
		const serializedMessageLengths = new Map<ModelMessage, number>();
		const systemMessages = messages.filter((message) => message.role === 'system');
		const conversationMessages = messages.filter((message) => message.role !== 'system');
		const turns = groupMessagesIntoTurns(conversationMessages);
		const systemSize = measureMessages(systemMessages, serializedMessageLengths);

		if (turns.length === 0) {
			ensureWithinBudget(systemSize, this.maxContextCharacters);
			return systemMessages;
		}

		const currentTurn = turns.at(-1) ?? [];
		const currentTurnSize = measureMessages(currentTurn, serializedMessageLengths);
		const selectedTurns: ModelMessage[][] = [currentTurn];
		let selectedSize: MessageGroupSize = {
			serializedCharacters: systemSize.serializedCharacters + currentTurnSize.serializedCharacters,
			messageCount: systemSize.messageCount + currentTurnSize.messageCount,
		};

		ensureWithinBudget(selectedSize, this.maxContextCharacters);

		for (let index = turns.length - 2; index >= 0; index -= 1) {
			const turn = turns[index];

			if (turn === undefined) {
				continue;
			}

			const turnSize = measureMessages(turn, serializedMessageLengths);
			const candidateSize: MessageGroupSize = {
				serializedCharacters: selectedSize.serializedCharacters + turnSize.serializedCharacters,
				messageCount: selectedSize.messageCount + turnSize.messageCount,
			};

			if (measureArraySize(candidateSize) > this.maxContextCharacters) {
				break;
			}

			selectedSize = candidateSize;
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

const ensureWithinBudget = (size: MessageGroupSize, maxContextCharacters: number): void => {
	if (measureArraySize(size) > maxContextCharacters) {
		throw new ContextBudgetExceededError(maxContextCharacters);
	}
};

const measureMessages = (
	messages: ModelMessage[],
	serializedMessageLengths = new Map<ModelMessage, number>(),
): MessageGroupSize => {
	let serializedCharacters = 0;
	for (const message of messages) {
		let length = serializedMessageLengths.get(message);
		if (length === undefined) {
			length = JSON.stringify(message).length;
			serializedMessageLengths.set(message, length);
		}
		serializedCharacters += length;
	}
	return { serializedCharacters, messageCount: messages.length };
};

// Groups form one array: count brackets once and a comma between every message.
const measureArraySize = (size: MessageGroupSize): number =>
	2 + size.serializedCharacters + Math.max(0, size.messageCount - 1);
