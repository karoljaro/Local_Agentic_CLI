declare const EventIdBrand: unique symbol;
declare const SessionIdBrand: unique symbol;
declare const MessageIdBrand: unique symbol;
declare const ToolCallIdBrand: unique symbol;
declare const ISODateTimeBrand: unique symbol;

export type SessionId = string & { readonly [SessionIdBrand]: void };
export type EventId = string & { readonly [EventIdBrand]: void };
export type MessageId = string & { readonly [MessageIdBrand]: void };
export type ToolCallId = string & { readonly [ToolCallIdBrand]: void };
export type ISODateTime = string & { readonly [ISODateTimeBrand]: void };

export const asEventId = (eventId: string): EventId => {
	return eventId as EventId;
};

export const asSessionId = (sessionId: string): SessionId => {
	return sessionId as SessionId;
};

export const asMessageId = (messageId: string): MessageId => {
	return messageId as MessageId;
};

export const asToolCallId = (toolCallId: string): ToolCallId => {
	return toolCallId as ToolCallId;
};

export const asISODateTime = (timestamp: string): ISODateTime => {
	return timestamp as ISODateTime;
};