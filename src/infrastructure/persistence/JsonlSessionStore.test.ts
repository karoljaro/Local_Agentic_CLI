import { mkdtemp, rm } from "node:fs/promises";
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
	cleanup: () => Promise<void>;
}> => {
	const directory = await mkdtemp(join(tmpdir(), "jsonl-session-store-"));

	return {
		store: new JsonlSessionStore(directory),
		cleanup: () => rm(directory, { recursive: true, force: true }),
	};
};

describe("JsonlSessionStore", () => {
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
});
