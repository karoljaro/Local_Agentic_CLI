import type { ClockPort } from "@/application/ports/ClockPort";
import { asISODateTime, type ISODateTime } from "@/domain/Ids";

export class TemporalClock implements ClockPort {
	now(): ISODateTime {
		if (typeof Temporal === "undefined") {
			return asISODateTime(new Date().toISOString());
		}

		return asISODateTime(Temporal.Now.instant().toString());
	}
}
