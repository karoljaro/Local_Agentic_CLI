import type {
	ModelChatResult,
	ModelStreamChunk,
} from '@/application/ports/ModelPort';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';

export type OllamaChatStreamResponse = {
	message?: {
		content?: string;
		tool_calls?: OllamaToolCall[];
	};
	error?: string;
	done?: boolean;
};

export type OllamaChatResponse = {
	message?: {
		content?: string;
		tool_calls?: OllamaToolCall[];
	};
	error?: string;
};

type OllamaToolCall = {
	function?: {
		name?: string;
		arguments?: unknown;
	};
};

export const toOllamaMessage = (
	message: ModelMessage,
): Record<string, unknown> => {
	const baseMessage: Record<string, unknown> = {
		role: message.role,
		content: message.content,
	};

	if (message.role === 'tool') {
		return {
			...baseMessage,
			tool_name: message.toolName,
		};
	}

	if (
		message.role === 'assistant' &&
		message.toolCalls !== undefined &&
		message.toolCalls.length > 0
	) {
		return {
			...baseMessage,
			tool_calls: message.toolCalls.map(toOllamaToolCall),
		};
	}

	return baseMessage;
};

export const toOllamaTool = (
	tool: ToolDefinition,
): Record<string, unknown> => {
	return {
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		},
	};
};

export const toModelChatResult = (
	response: OllamaChatResponse,
): ModelChatResult => {
	return {
		content: response.message?.content ?? '',
		toolCalls: parseOllamaToolCalls(response.message?.tool_calls ?? []),
	};
};

export const toModelStreamChunk = (
	response: OllamaChatStreamResponse,
): ModelStreamChunk => {
	const toolCalls = parseOllamaToolCalls(response.message?.tool_calls ?? []);

	return {
		contentDelta: response.message?.content ?? '',
		...(toolCalls.length === 0 ? {} : { toolCalls }),
	};
};

const toOllamaToolCall = (
	toolCall: ModelToolCall,
): Record<string, unknown> => {
	return {
		function: {
			name: toolCall.name,
			arguments: toolCall.arguments,
		},
	};
};

const parseOllamaToolCalls = (
	toolCalls: OllamaToolCall[],
): ModelToolCall[] => {
	return toolCalls.flatMap((toolCall) => {
		const name = toolCall.function?.name;

		if (name === undefined || name.length === 0) {
			return [];
		}

		return [
			{
				name,
				arguments: parseToolCallArguments(toolCall.function?.arguments),
			},
		];
	});
};

const parseToolCallArguments = (toolArguments: unknown): unknown => {
	if (typeof toolArguments !== 'string') {
		return toolArguments ?? {};
	}

	try {
		return JSON.parse(toolArguments);
	} catch {
		return toolArguments;
	}
};
