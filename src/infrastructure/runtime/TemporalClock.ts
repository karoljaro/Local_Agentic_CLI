import type { ClockPort } from '@/application/ports/ClockPort';
import { asISODateTime, type ISODateTime } from '@/domain/Ids';

export class TemporalClock implements ClockPort {
	now(): ISODateTime {
		return asISODateTime(Temporal.Now.instant().toString());
	}
}
