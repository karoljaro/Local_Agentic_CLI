import type { ToolCallId } from './Ids';

export type ToolDefinition = {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	requiresApproval?: boolean;
};

export type ModelToolCall = {
	id?: ToolCallId;
	name: string;
	arguments: unknown;
};
