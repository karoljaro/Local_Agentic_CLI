import type { ModelStreamChunk } from '@/application/ports/ModelPort';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';

export type OllamaChatStreamResponse = {
	message?: {
		content?: string;
		tool_calls?: unknown;
	};
	error?: string;
	done?: boolean;
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
	toolCalls: unknown,
): ModelToolCall[] => {
	if (toolCalls === undefined) {
		return [];
	}

	if (!Array.isArray(toolCalls)) {
		throw new Error('Invalid Ollama tool calls: expected an array.');
	}

	return toolCalls.map((toolCall) => {
		if (!isRecord(toolCall) || !isRecord(toolCall['function'])) {
			throw new Error('Invalid Ollama tool call: missing function.');
		}

		const toolFunction = toolCall['function'];
		const name = toolFunction['name'];

		if (typeof name !== 'string' || name.trim().length === 0) {
			throw new Error('Invalid Ollama tool call: missing function name.');
		}

		return {
			name: name.trim(),
			arguments: parseToolCallArguments(toolFunction['arguments'], name),
		};
	});
};

const parseToolCallArguments = (
	toolArguments: unknown,
	toolName: string,
): unknown => {
	if (typeof toolArguments !== 'string') {
		return toolArguments ?? {};
	}

	try {
		return JSON.parse(toolArguments);
	} catch (caughtError) {
		const message =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		throw new Error(
			`Invalid Ollama tool arguments for ${toolName}: ${message}`,
		);
	}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
