import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';

export type ModelChatInput = {
	messages: ModelMessage[];
	tools?: ToolDefinition[];
};

export type ModelStreamChunk = {
	contentDelta: string;
};

export type ModelChatResult = {
	content: string;
	toolCalls: ModelToolCall[];
};

export interface ModelPort {
	chat(input: ModelChatInput): Promise<ModelChatResult>;
	streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk>;
}
