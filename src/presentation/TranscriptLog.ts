import type { AgentEvent } from '@/domain/AgentEvent';
import type { ToolCallId } from '@/domain/Ids';
import { describeToolRequest, formatToolName } from './formatters/tool';

export type TranscriptEntry = {
	id: string;
	kind: 'user' | 'assistant' | 'tool' | 'error' | 'notice' | 'cancelled';
	content: string;
	failure?: boolean;
};

export type ToolActivity = {
	id: ToolCallId;
	description: string;
	status: 'queued' | 'approval' | 'running';
};

// This is the product transcript, not the model's context. Tool outputs stay in durable events.
export class TranscriptLog {
	private readonly entries: TranscriptEntry[] = [];
	private readonly entryIds = new Set<string>();
	private readonly tools = new Map<ToolCallId, ToolActivity>();
	private activity: ToolActivity[] = [];

	get history(): readonly TranscriptEntry[] {
		return this.entries;
	}

	get activeTools(): readonly ToolActivity[] {
		return this.activity;
	}

	append(entry: TranscriptEntry): boolean {
		if (this.entryIds.has(entry.id)) return false;
		this.entryIds.add(entry.id);
		this.entries.push(entry);
		return true;
	}

	apply(event: AgentEvent): TranscriptEntry | undefined {
		let entry: TranscriptEntry | undefined;
		switch (event.type) {
			case 'prompt.submitted':
				entry = { id: String(event.id), kind: 'user', content: event.prompt };
				break;
			case 'assistant.message.completed':
			case 'assistant.tool_calls.completed':
				if (event.content.trim()) {
					entry = { id: String(event.id), kind: 'assistant', content: event.content };
				}
				break;
			case 'tool.call.requested':
				this.tools.set(event.toolCallId, {
					id: event.toolCallId,
					description: describeToolRequest(event.toolName, event.toolInput),
					status: event.approvalRequired ? 'approval' : 'queued',
				});
				this.activity = [...this.tools.values()];
				break;
			case 'tool.call.started':
				this.tools.set(event.toolCallId, {
					id: event.toolCallId,
					description:
						this.tools.get(event.toolCallId)?.description ?? formatToolName(event.toolName),
					status: 'running',
				});
				this.activity = [...this.tools.values()];
				break;
			case 'tool.call.completed':
			case 'tool.call.failed': {
				const description =
					this.tools.get(event.toolCallId)?.description ?? formatToolName(event.toolName);
				this.tools.delete(event.toolCallId);
				this.activity = [...this.tools.values()];
				entry =
					event.type === 'tool.call.failed'
						? {
								id: String(event.id),
								kind: 'tool',
								content: `${description} · ${event.error.message}`,
								failure: true,
							}
						: { id: String(event.id), kind: 'tool', content: description };
				break;
			}
			case 'agent.error':
				entry = { id: String(event.id), kind: 'error', content: event.error.message };
				break;
		}
		return entry && this.append(entry) ? entry : undefined;
	}

	clearActivity(): void {
		this.tools.clear();
		this.activity = [];
	}
}
