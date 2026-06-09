import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SessionStorePort } from "@/application/ports/SessionStorePort";
import type { AgentEvent } from "@/domain/AgentEvent";
import type { SessionId } from "@/domain/Ids";

export class JsonlSessionStore implements SessionStorePort {
	private readonly sessionsDirectory: string;

	constructor(sessionsDirectory = ".agent/sessions") {
		this.sessionsDirectory = sessionsDirectory;
	}

	async readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		try {
			const content = await readFile(this.getEventsFilePath(sessionId), "utf8");

			return content
				.split("\n")
				.filter((line) => line.trim().length > 0)
				.map((line) => JSON.parse(line) as AgentEvent);
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
		return join(this.sessionsDirectory, sessionId);
	}

	private getEventsFilePath(sessionId: SessionId): string {
		return join(this.getSessionDirectoryPath(sessionId), "events.jsonl");
	}
}
