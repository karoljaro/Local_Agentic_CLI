import { describe, expect, test } from "bun:test";

import { BunUuidV7IdGenerator } from "./BunUuidV7IdGenerator";

describe("BunUuidV7IdGenerator", () => {
	test("generates UUIDv7-backed domain ids", () => {
		const idGenerator = new BunUuidV7IdGenerator();

		expect(idGenerator.nextEventId()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(idGenerator.nextMessageId()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});
});
