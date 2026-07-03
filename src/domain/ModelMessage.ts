import type { MessageId, ToolCallId } from './Ids';
import type { ModelToolCall } from './Tool';

export type ModelMessage =
	| SystemModelMessage
	| UserModelMessage
	| AssistantModelMessage
	| ToolModelMessage;

type SystemModelMessage = {
	id?: MessageId;
	role: 'system';
	content: string;
};

type UserModelMessage = {
	id: MessageId;
	role: 'user';
	content: string;
};

type AssistantModelMessage = {
	id?: MessageId;
	role: 'assistant';
	content: string;
	toolCalls?: ModelToolCall[];
};

type ToolModelMessage = {
	id?: MessageId;
	role: 'tool';
	toolCallId: ToolCallId;
	toolName: string;
	content: string;
};
