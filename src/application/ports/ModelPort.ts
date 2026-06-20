import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';

export type ModelChatInput = {
	messages: ModelMessage[];
	tools?: ToolDefinition[];
};

export type ModelStreamChunk = {
	contentDelta: string;
	toolCalls?: ModelToolCall[];
};

export interface ModelPort {
	streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk>;
}
