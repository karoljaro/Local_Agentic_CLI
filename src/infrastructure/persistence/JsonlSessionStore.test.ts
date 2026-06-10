import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@/domain/AgentEvent";
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
} from "@/domain/Ids";

import { JsonlSessionStore } from "./JsonlSessionStore";

const createTempStore = async (): Promise<{
	store: JsonlSessionStore;
	directory: string;
	cleanup: () => Promise<void>;
}> => {
	const directory = await mkdtemp(join(tmpdir(), "jsonl-session-store-"));

	return {
		store: new JsonlSessionStore(directory),
		directory,
		cleanup: () => rm(directory, { recursive: true, force: true }),
	};
};

describe("JsonlSessionStore", () => {
	test("returns empty sessions for a missing sessions directory", async () => {
		const { store, cleanup } = await createTempStore();

		try {
			await cleanup();

			const sessions = await store.listSessions();

			expect(sessions).toEqual([]);
		} finally {
			await cleanup();
		}
	});

	test("lists sessions with event files in descending id order", async () => {
		const { store, directory, cleanup } = await createTempStore();
		const timestamp = asISODateTime("2026-06-09T12:00:00.000Z");
		const firstSessionId = asSessionId("session-1");
		const secondSessionId = asSessionId("session-2");

		try {
			await mkdir(join(directory, "empty-session"), { recursive: true });
			await writeFile(join(directory, "not-a-session.txt"), "ignored", "utf8");

			await store.appendSessionEvent({
				id: asEventId("event-1"),
				sessionId: firstSessionId,
				type: "prompt.submitted",
				timestamp,
				messageId: asMessageId("message-1"),
				prompt: "Hello",
			});
			await store.appendSessionEvent({
				id: asEventId("event-2"),
				sessionId: secondSessionId,
				type: "prompt.submitted",
				timestamp,
				messageId: asMessageId("message-2"),
				prompt: "Hi",
			});

			const sessions = await store.listSessions();

			expect(sessions).toEqual([
				{ sessionId: secondSessionId },
				{ sessionId: firstSessionId },
			]);
		} finally {
			await cleanup();
		}
	});

	test("returns empty events for a missing session", async () => {
		const { store, cleanup } = await createTempStore();

		try {
			const events = await store.readSessionEvents(asSessionId("missing-session"));

			expect(events).toEqual([]);
		} finally {
			await cleanup();
		}
	});

	test("appends and reads session events in order", async () => {
		const { store, cleanup } = await createTempStore();
		const sessionId = asSessionId("session-1");
		const timestamp = asISODateTime("2026-06-09T12:00:00.000Z");

		const firstEvent: AgentEvent = {
			id: asEventId("event-1"),
			sessionId,
			type: "prompt.submitted",
			timestamp,
			messageId: asMessageId("message-1"),
			prompt: "Hello",
		};
		const secondEvent: AgentEvent = {
			id: asEventId("event-2"),
			sessionId,
			type: "assistant.message.completed",
			timestamp,
			messageId: asMessageId("message-2"),
			content: "Hi",
		};

		try {
			await store.appendSessionEvent(firstEvent);
			await store.appendSessionEvent(secondEvent);

			const events = await store.readSessionEvents(sessionId);

			expect(events).toEqual([firstEvent, secondEvent]);
		} finally {
			await cleanup();
		}
	});

	test("reports the line number for malformed JSONL", async () => {
		const { store, directory, cleanup } = await createTempStore();
		const sessionId = asSessionId("session-1");
		const sessionDirectory = join(directory, sessionId);

		try {
			await mkdir(sessionDirectory, { recursive: true });
			await writeFile(
				join(sessionDirectory, "events.jsonl"),
				'{"type":"prompt.submitted"}\nnot-json\n',
				"utf8",
			);

			await expect(store.readSessionEvents(sessionId)).rejects.toThrow(
				"line 2",
			);
		} finally {
			await cleanup();
		}
	});

	test("rejects session ids that are unsafe path segments", async () => {
		const { store, cleanup } = await createTempStore();

		try {
			await expect(
				store.readSessionEvents(asSessionId("../outside")),
			).rejects.toThrow("Invalid session id");
		} finally {
			await cleanup();
		}
	});
});
