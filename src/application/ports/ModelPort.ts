import type { ModelMessage } from "@/domain/ModelMessage";

export type ModelChatInput = {
    messages: ModelMessage[];
};

export type ModelStreamChunk = {
    contentDelta: string;
};

export interface ModelPort {
    streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk>;
}