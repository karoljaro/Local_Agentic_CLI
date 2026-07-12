import type { AgentEvent } from '@/domain/AgentEvent';
import type { SessionId, ToolCallId } from '@/domain/Ids';
import { describeToolRequest, formatToolName } from '../formatters/tool';
import type { ActiveTool, ChatState, HistoryEntry } from '../types';

export type ChatAction =
	| { type: 'session.load-started' }
	| { type: 'session.loaded'; events: AgentEvent[] }
	| { type: 'session.load-failed'; message: string }
	| { type: 'engine.event'; event: AgentEvent }
	| { type: 'turn.started' }
	| { type: 'turn.streaming' }
	| { type: 'turn.finished'; assistant?: HistoryEntry }
	| { type: 'turn.failed'; entries: HistoryEntry[] }
	| { type: 'history.append'; entry: HistoryEntry };

export const createChatState = (sessionId: SessionId): ChatState => ({
	sessionId,
	history: [],
	activeTools: [],
	loadStatus: 'loading',
	turnStatus: 'idle',
});

export const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
	switch (action.type) {
		case 'session.load-started':
			return { ...state, history: [], activeTools: [], loadStatus: 'loading', turnStatus: 'idle' };
		case 'session.loaded': {
			const loaded = reduceSessionEvents(state.sessionId, action.events);
			return { ...loaded, loadStatus: 'ready', turnStatus: 'idle' };
		}
		case 'session.load-failed':
			return {
				...state,
				loadStatus: 'ready',
				history: appendUnique(state.history, {
					id: `load-error:${state.sessionId}`,
					kind: 'error',
					content: action.message,
				}),
			};
		case 'engine.event':
			return action.event.sessionId === state.sessionId ? applyEvent(state, action.event) : state;
		case 'turn.started':
			return { ...state, turnStatus: 'waiting' };
		case 'turn.streaming':
			return state.turnStatus === 'streaming' ? state : { ...state, turnStatus: 'streaming' };
		case 'turn.finished':
			return {
				...state,
				turnStatus: 'idle',
				...(action.assistant === undefined
					? {}
					: { history: appendUnique(state.history, action.assistant) }),
			};
		case 'turn.failed':
			return {
				...state,
				turnStatus: 'idle',
				history: action.entries.reduce(appendUnique, state.history),
			};
		case 'history.append':
			return { ...state, history: appendUnique(state.history, action.entry) };
	}
};

export const reduceSessionEvents = (sessionId: SessionId, events: AgentEvent[]): ChatState => {
	return events.reduce(
		(state, event) => (event.sessionId === sessionId ? applyEvent(state, event) : state),
		createChatState(sessionId),
	);
};

export const getSessionModelName = (events: AgentEvent[]): string | undefined => {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type === 'prompt.submitted' && event.modelName !== undefined) {
			return event.modelName;
		}
	}

	return undefined;
};

const applyEvent = (state: ChatState, event: AgentEvent): ChatState => {
	switch (event.type) {
		case 'prompt.submitted':
			return withHistory(state, {
				id: String(event.id),
				kind: 'user',
				content: event.prompt,
			});
		case 'assistant.message.completed':
			return event.content.trim().length === 0
				? state
				: withHistory(state, {
						id: String(event.id),
						kind: 'assistant',
						content: event.content,
					});
		case 'assistant.tool_calls.completed':
			return event.content.trim().length === 0
				? state
				: withHistory(state, {
						id: String(event.id),
						kind: 'assistant',
						content: event.content,
					});
		case 'tool.call.requested':
			return withActiveTool(state, {
				id: event.toolCallId,
				name: event.toolName,
				description: describeToolRequest(event.toolName, event.toolInput),
				status: event.approvalRequired ? 'approval' : 'queued',
			});
		case 'tool.call.started':
			return withActiveTool(state, {
				id: event.toolCallId,
				name: event.toolName,
				description:
					state.activeTools.find((tool) => tool.id === event.toolCallId)?.description ??
					formatToolName(event.toolName),
				status: 'running',
			});
		case 'tool.call.completed':
			return finishTool(state, event.toolCallId, {
				id: String(event.id),
				kind: 'tool',
				label: event.toolName,
				content: getToolDescription(state.activeTools, event.toolCallId, event.toolName),
				status: 'success',
			});
		case 'tool.call.failed':
			return finishTool(state, event.toolCallId, {
				id: String(event.id),
				kind: 'tool',
				label: event.toolName,
				content: `${getToolDescription(state.activeTools, event.toolCallId, event.toolName)} · ${event.error.message}`,
				status: 'failure',
			});
		case 'agent.error':
			return withHistory(state, {
				id: String(event.id),
				kind: 'error',
				content: event.error.message,
			});
	}
};

const withHistory = (state: ChatState, entry: HistoryEntry): ChatState => ({
	...state,
	history: appendUnique(state.history, entry),
});

const appendUnique = (entries: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] => {
	return entries.some((candidate) => candidate.id === entry.id) ? entries : [...entries, entry];
};

const withActiveTool = (state: ChatState, tool: ActiveTool): ChatState => {
	const currentIndex = state.activeTools.findIndex((candidate) => candidate.id === tool.id);
	if (currentIndex < 0) {
		return { ...state, activeTools: [...state.activeTools, tool] };
	}

	const activeTools = [...state.activeTools];
	activeTools[currentIndex] = tool;
	return { ...state, activeTools };
};

const finishTool = (state: ChatState, toolCallId: ToolCallId, entry: HistoryEntry): ChatState => ({
	...state,
	activeTools: state.activeTools.filter((tool) => tool.id !== toolCallId),
	history: appendUnique(state.history, entry),
});

const getToolDescription = (
	activeTools: ActiveTool[],
	toolCallId: ToolCallId,
	toolName: string,
): string => {
	return (
		activeTools.find((candidate) => candidate.id === toolCallId)?.description ??
		formatToolName(toolName)
	);
};
