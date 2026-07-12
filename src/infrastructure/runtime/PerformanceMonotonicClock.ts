import type { MonotonicClockPort } from '@/application/ports/MonotonicClockPort';

export class PerformanceMonotonicClock implements MonotonicClockPort {
	nowMilliseconds(): number {
		return performance.now();
	}
}
