import type { ListedSessionEvent } from '@/application/use-cases/ListSessionEvents';
import type { TranscriptEntry } from './types';

export const sessionEventsToTranscript = (events: ListedSessionEvent[]): TranscriptEntry[] => {
	return events.map((event) => {
		if (event.type === 'prompt.submitted') {
			return { id: String(event.id), role: 'user', content: event.prompt };
		}

		return { id: String(event.id), role: 'assistant', content: event.content };
	});
};

export const getSessionModelName = (events: ListedSessionEvent[]): string | undefined => {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];

		if (event?.type === 'prompt.submitted' && event.modelName !== undefined) {
			return event.modelName;
		}
	}

	return undefined;
};
