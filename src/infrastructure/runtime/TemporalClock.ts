import type { ClockPort } from "@/application/ports/ClockPort";
import { asISODateTime, type ISODateTime } from "@/domain/Ids";

export class TemporalClock implements ClockPort {
	now(): ISODateTime {
		if (typeof Temporal === "undefined") {
			throw new Error("Temporal is not available in this JavaScript runtime.");
		}

		return asISODateTime(Temporal.Now.instant().toString());
	}
}
