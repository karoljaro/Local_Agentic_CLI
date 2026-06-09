import type { ISODateTime } from "@/domain/Ids";

export interface ClockPort {
	now(): ISODateTime;
}
