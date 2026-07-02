import { access, appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import type {
	SessionStorePort,
	StoredSession,
} from "@/application/ports/SessionStorePort";
import type { AgentEvent } from "@/domain/AgentEvent";
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	asToolCallId,
	type SessionId,
} from "@/domain/Ids";

export class JsonlSessionStore implements SessionStorePort {
	private readonly sessionsDirectory: string;

	constructor(sessionsDirectory = ".agent/sessions") {
		if (sessionsDirectory.trim().length === 0) {
			throw new Error("Session store directory cannot be empty.");
		}

		this.sessionsDirectory = sessionsDirectory;
	}

	async listSessions(): Promise<StoredSession[]> {
		let entries;

		try {
			entries = await readdir(this.sessionsDirectory, { withFileTypes: true });
		} catch (caughtError) {
			if (isNodeErrorCode(caughtError, "ENOENT")) {
				return [];
			}

			throw caughtError;
		}

		const sessions: StoredSession[] = [];

		for (const entry of entries) {
			if (!entry.isDirectory() || !isSafeSessionPathSegment(entry.name)) {
				continue;
			}

			try {
				await access(join(this.sessionsDirectory, entry.name, "events.jsonl"));
				sessions.push({ sessionId: asSessionId(entry.name) });
			} catch (caughtError) {
				if (!isNodeErrorCode(caughtError, "ENOENT")) {
					throw caughtError;
				}
			}
		}

		return sessions.sort((left, right) =>
			String(right.sessionId).localeCompare(String(left.sessionId)),
		);
	}

	async readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		const eventsFilePath = this.getEventsFilePath(sessionId);

		try {
			const content = await readFile(eventsFilePath, "utf8");

			return parseJsonlEvents(content, eventsFilePath);
		} catch (caughtError) {
			if (isNodeErrorCode(caughtError, "ENOENT")) {
				return [];
			}

			throw caughtError;
		}
	}

	async appendSessionEvent(event: AgentEvent): Promise<void> {
		await mkdir(this.getSessionDirectoryPath(event.sessionId), {
			recursive: true,
		});

		await appendFile(
			this.getEventsFilePath(event.sessionId),
			`${JSON.stringify(event)}\n`,
			"utf8",
		);
	}

	private getSessionDirectoryPath(sessionId: SessionId): string {
		return join(this.sessionsDirectory, toSafeSessionPathSegment(sessionId));
	}

	private getEventsFilePath(sessionId: SessionId): string {
		return join(this.getSessionDirectoryPath(sessionId), "events.jsonl");
	}
}

const parseJsonlEvents = (content: string, filePath: string): AgentEvent[] => {
	const events: AgentEvent[] = [];
	const lines = content.split("\n");
	const lineCount = content.endsWith("\n") ? lines.length : lines.length - 1;

	for (let index = 0; index < lineCount; index += 1) {
		const line = lines[index];

		if (line === undefined) {
			continue;
		}

		if (line.trim().length === 0) {
			continue;
		}

		try {
			events.push(parseAgentEvent(JSON.parse(line)));
		} catch (caughtError) {
			const message =
				caughtError instanceof Error ? caughtError.message : String(caughtError);

			throw new Error(
				`Invalid JSONL event in ${filePath} at line ${index + 1}: ${message}`,
			);
		}
	}

	return events;
};

const parseAgentEvent = (value: unknown): AgentEvent => {
	const result = AgentEventSchema.safeParse(value);

	if (!result.success) {
		throw new Error(z.prettifyError(result.error));
	}

	return result.data as AgentEvent;
};

const NonEmptyString = z.string().min(1);

const AgentEventBaseSchema = z.object({
	id: NonEmptyString.transform(asEventId),
	sessionId: NonEmptyString.transform(asSessionId),
	timestamp: NonEmptyString.transform(asISODateTime),
});

const MessageIdSchema = NonEmptyString.transform(asMessageId);
const ToolCallIdSchema = NonEmptyString.transform(asToolCallId);

const AgentEventSchema = z.discriminatedUnion("type", [
	AgentEventBaseSchema.extend({
		type: z.literal("prompt.submitted"),
		messageId: MessageIdSchema,
		prompt: z.string(),
		modelName: z.string().optional(),
	}).loose(),
	AgentEventBaseSchema.extend({
		type: z.literal("assistant.message.started"),
		messageId: MessageIdSchema,
	}).loose(),
	AgentEventBaseSchema.extend({
		type: z.literal("assistant.message.delta"),
		messageId: MessageIdSchema,
		delta: z.string(),
	}).loose(),
	AgentEventBaseSchema.extend({
		type: z.literal("assistant.message.completed"),
		messageId: MessageIdSchema,
		content: z.string(),
	}).loose(),
	AgentEventBaseSchema.extend({
		type: z.literal("tool.call.requested"),
		toolCallId: ToolCallIdSchema,
		toolName: NonEmptyString,
		toolInput: z.unknown(),
		approvalRequired: z.boolean(),
	}).loose(),
	AgentEventBaseSchema.extend({
		type: z.literal("tool.call.started"),
		toolCallId: ToolCallIdSchema,
		toolName: NonEmptyString,
	}).loose(),
	AgentEventBaseSchema.extend({
		type: z.literal("tool.call.completed"),
		toolCallId: ToolCallIdSchema,
		toolName: NonEmptyString,
		output: z.unknown(),
		durationMs: z.number().optional(),
	}).loose(),
	AgentEventBaseSchema.extend({
		type: z.literal("tool.call.failed"),
		toolCallId: ToolCallIdSchema,
		toolName: NonEmptyString,
		error: z
			.object({
				message: z.string(),
				code: z.string().optional(),
				details: z.unknown().optional(),
			})
			.loose(),
	}).loose(),
	AgentEventBaseSchema.extend({
		type: z.literal("agent.error"),
		error: z
			.object({
				message: z.string(),
				code: z.string().optional(),
				recoverable: z.boolean(),
				details: z.unknown().optional(),
			})
			.loose(),
	}).loose(),
]);

const toSafeSessionPathSegment = (sessionId: SessionId): string => {
	const value = String(sessionId);

	if (!isSafeSessionPathSegment(value)) {
		throw new Error(`Invalid session id for filesystem path: ${value}`);
	}

	return value;
};

const isSafeSessionPathSegment = (value: string): boolean => {
	return (
		value.length > 0 &&
		value !== "." &&
		value !== ".." &&
		!value.includes("/") &&
		!value.includes("\\") &&
		!value.includes("\0")
	);
};

const isNodeErrorCode = (error: unknown, code: string): boolean => {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
};
