export type StreamListener = () => void;

export class StreamBuffer {
	private content = '';
	private pending = '';
	private timer: ReturnType<typeof setTimeout> | undefined;
	private readonly listeners = new Set<StreamListener>();

	constructor(private readonly intervalMs = 32) {}

	readonly getSnapshot = (): string => this.content;

	readonly subscribe = (listener: StreamListener): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	start(): void {
		this.clearTimer();
		this.content = '';
		this.pending = '';
		this.emit();
	}

	push(delta: string): void {
		if (delta.length === 0) {
			return;
		}

		this.pending += delta;
		if (this.timer === undefined) {
			this.timer = setTimeout(() => this.flush(), this.intervalMs);
		}
	}

	flush(): string {
		this.clearTimer();
		if (this.pending.length > 0) {
			this.content += this.pending;
			this.pending = '';
			this.emit();
		}
		return this.content;
	}

	reset(): void {
		this.clearTimer();
		this.pending = '';
		if (this.content.length > 0) {
			this.content = '';
			this.emit();
		}
	}

	dispose(): void {
		this.clearTimer();
		this.pending = '';
		this.listeners.clear();
	}

	private clearTimer(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
