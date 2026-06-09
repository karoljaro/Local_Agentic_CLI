import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SessionStorePort } from "@/application/ports/SessionStorePort";
import type { AgentEvent } from "@/domain/AgentEvent";
import type { SessionId } from "@/domain/Ids";

export class JsonlSessionStore implements SessionStorePort {
	private readonly sessionsDirectory: string;

	constructor(sessionsDirectory = ".agent/sessions") {
		if (sessionsDirectory.trim().length === 0) {
			throw new Error("Session store directory cannot be empty.");
		}

		this.sessionsDirectory = sessionsDirectory;
	}

	async readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		const eventsFilePath = this.getEventsFilePath(sessionId);

		try {
			const content = await readFile(eventsFilePath, "utf8");

			return parseJsonlEvents(content, eventsFilePath);
		} catch (caughtError) {
			const error = caughtError as { code?: unknown };

			if (error.code === "ENOENT") {
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

	for (const [index, line] of content.split("\n").entries()) {
		if (line.trim().length === 0) {
			continue;
		}

		try {
			events.push(JSON.parse(line) as AgentEvent);
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

const toSafeSessionPathSegment = (sessionId: SessionId): string => {
	const value = String(sessionId);

	if (
		value.length === 0 ||
		value === "." ||
		value === ".." ||
		value.includes("/") ||
		value.includes("\\") ||
		value.includes("\0")
	) {
		throw new Error(`Invalid session id for filesystem path: ${value}`);
	}

	return value;
};
