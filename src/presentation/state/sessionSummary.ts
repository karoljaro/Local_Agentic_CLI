import type { AgentEvent } from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';
import type { SessionOption } from '../types';

export const buildSessionOption = (sessionId: SessionId, events: AgentEvent[]): SessionOption => {
	const latestEvent = events.at(-1);
	let preview: string | undefined;
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type === 'prompt.submitted') {
			preview = event.prompt.replaceAll('\r', '').replaceAll('\n', ' ').trim();
			break;
		}
	}

	return {
		sessionId,
		...(latestEvent === undefined ? {} : { lastActiveAt: String(latestEvent.timestamp) }),
		...(preview === undefined || preview.length === 0 ? {} : { preview }),
	};
};
