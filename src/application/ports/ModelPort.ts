import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelContextProfile } from '@/domain/ModelContextProfile';
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';

export type ModelChatInput = {
	messages: ModelMessage[];
	contextProfile: ModelContextProfile;
	/** Optional provider-independent structured output contract for narrow operations. */
	responseSchema?: Record<string, unknown>;
	tools?: ToolDefinition[];
	signal?: AbortSignal;
};

export type UnloadModelInput = {
	signal?: AbortSignal;
};

export type ModelStreamChunk = {
	contentDelta: string;
	toolCalls?: ModelToolCall[];
	finishReason?: 'stop' | 'length' | 'tool' | 'unknown';
	usage?: { promptTokens?: number; outputTokens?: number };
};

export interface ModelPort {
	streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk>;
}

export interface ModelMemoryPort {
	unload(input?: UnloadModelInput): Promise<void>;
}
