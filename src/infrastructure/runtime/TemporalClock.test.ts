import { describe, expect, test } from "bun:test";

import { TemporalClock } from "./TemporalClock";

describe("TemporalClock", () => {
	test("returns an ISO timestamp when Temporal is unavailable", () => {
		const clock = new TemporalClock();

		expect(clock.now()).toMatch(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
		);
	});
});
