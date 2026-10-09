import type { ModelMessage } from '@/domain/ModelMessage';

/** Shared Phase 16 user boundaries; leaves reducer-owned messages untouched. */
export const groupMessagesIntoTurns = (messages: ModelMessage[]): ModelMessage[][] => {
	const turns: ModelMessage[][] = [];
	for (const message of messages) {
		if (message.role === 'system')
			throw new Error('Canonical model history must not contain system instructions.');
		if (message.role === 'user' || turns.length === 0) turns.push([message]);
		else turns.at(-1)!.push(message);
	}
	return turns;
};

/** Legacy orphan compatibility remains canonical, but is never semantically injected. */
export const isRetrievableTurn = (turn: ModelMessage[]): boolean => {
	if (turn[0]?.role !== 'user') return false;
	const seen = new Set<string>();
	const pending = new Map<string, string>();
	for (const message of turn) {
		if (message.role === 'assistant') {
			if (pending.size > 0) return false;
			for (const call of message.toolCalls ?? []) {
				if (!call.id || !call.name || seen.has(call.id)) return false;
				seen.add(call.id);
				pending.set(call.id, call.name);
			}
		} else if (message.role === 'tool') {
			if (
				pending.get(message.toolCallId) !== message.toolName ||
				!pending.delete(message.toolCallId)
			)
				return false;
		} else if (pending.size > 0) return false;
	}
	return pending.size === 0;
};

export const HISTORY_TEXT_LIMIT = 8_000;
const naturalText = (text: string, limit: number): string =>
	text.slice(0, limit).replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, '');

export const historyQuery = (turn: ModelMessage[]): string => {
	const first = turn[0];
	return first?.role === 'user' ? first.content.slice(0, HISTORY_TEXT_LIMIT) : '';
};

/** Search-only projection. Tool bodies and mutation text never enter embeddings. */
export const projectHistoryTurn = (turn: ModelMessage[]): string => {
	const parts: string[] = [];
	for (const message of turn) {
		if (message.role === 'user') parts.push(`user: ${naturalText(message.content, 4_000)}`);
		if (message.role !== 'assistant') continue;
		if (message.content) parts.push(`assistant: ${naturalText(message.content, 1_000)}`);
		for (const call of message.toolCalls ?? []) {
			parts.push(`tool: ${call.name}`);
			if (typeof call.arguments !== 'object' || call.arguments === null) continue;
			const args = call.arguments as Record<string, unknown>;
			for (const key of [
				'path',
				'source',
				'destination',
				'pattern',
				'query',
				'startLine',
				'startOffset',
				'endLine',
			]) {
				const value = args[key];
				if (typeof value === 'string') parts.push(`${key}: ${value.slice(0, 300)}`);
				else if (typeof value === 'number' && Number.isFinite(value))
					parts.push(`${key}: ${value}`);
			}
		}
	}
	return parts.join('\n').slice(0, HISTORY_TEXT_LIMIT);
};
