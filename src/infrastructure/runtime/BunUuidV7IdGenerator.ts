import type { IdGeneratorPort } from '@/application/ports/IdGeneratorPort';
import {
	asEventId,
	asMessageId,
	asSessionId,
	asToolCallId,
	type EventId,
	type MessageId,
	type SessionId,
	type ToolCallId,
} from '@/domain/Ids';

export class BunUuidV7IdGenerator implements IdGeneratorPort {
	nextEventId(): EventId {
		return asEventId(this.nextId());
	}

	nextMessageId(): MessageId {
		return asMessageId(this.nextId());
	}

	nextSessionId(): SessionId {
		return asSessionId(this.nextId());
	}

	nextToolCallId(): ToolCallId {
		return asToolCallId(this.nextId());
	}

	private nextId(): string {
		return Bun.randomUUIDv7();
	}
}
