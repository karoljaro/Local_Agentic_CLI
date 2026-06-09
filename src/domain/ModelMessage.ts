import type { MessageId, ToolCallId } from './Ids';

export type ModelMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type ModelMessage =
	| SystemModelMessage
	| UserModelMessage
	| AssistantModelMessage
	| ToolModelMessage;

export type SystemModelMessage = {
	id?: MessageId;
	role: 'system';
	content: string;
};

export type UserModelMessage = {
	id: MessageId;
	role: 'user';
	content: string;
};

export type AssistantModelMessage = {
	id: MessageId;
	role: 'assistant';
	content: string;
};

export type ToolModelMessage = {
	id?: MessageId;
	role: 'tool';
	toolCallId: ToolCallId;
	toolName: string;
	content: string;
};