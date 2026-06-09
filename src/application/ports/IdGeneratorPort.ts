import type {
	EventId,
	MessageId,
	SessionId,
	ToolCallId,
} from "@/domain/Ids";

export interface IdGeneratorPort {
	nextEventId(): EventId;
	nextMessageId(): MessageId;
	nextSessionId(): SessionId;
	nextToolCallId(): ToolCallId;
}
