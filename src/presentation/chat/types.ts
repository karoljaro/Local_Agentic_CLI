import type { SessionId } from '@/domain/Ids';

export type UiStatus = 'idle' | 'loading' | 'streaming';

export type TranscriptEntry = {
	role: 'user' | 'assistant' | 'error';
	content: string;
};

export type SessionPickerOption =
	| {
			type: 'new';
	  }
	| {
			type: 'existing';
			sessionId: SessionId;
	  };
