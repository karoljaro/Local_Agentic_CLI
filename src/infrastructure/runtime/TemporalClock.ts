import type { ClockPort } from "@/application/ports/ClockPort";
import { asISODateTime, type ISODateTime } from "@/domain/Ids";
import { Temporal } from "temporal-polyfill";

export class TemporalClock implements ClockPort {
	now(): ISODateTime {
		// TODO: If temporal will work on the bun.js runtime, replace temporal-polyfill with the official temporal provided by the bun.js runtime
		if (typeof Temporal === 'undefined') {
			// return asISODateTime(new Date().toISOString());
			throw new Error(
				'Temporal API is not available in this environment.'
			);
		}

		return asISODateTime(Temporal.Now.instant().toString());
	}
}
