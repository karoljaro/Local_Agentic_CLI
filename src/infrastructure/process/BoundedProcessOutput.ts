export const PROCESS_OUTPUT_BYTES = 8_192;
export const PROCESS_OUTPUT_HEAD_BYTES = 2_048;
export const PROCESS_OUTPUT_TAIL_BYTES = PROCESS_OUTPUT_BYTES - PROCESS_OUTPUT_HEAD_BYTES;
export const PROCESS_OUTPUT_MARKER = '\n[... output truncated ...]\n';

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();
const markerBytes = encoder.encode(PROCESS_OUTPUT_MARKER).length;

/** Fixed head + tail ring: retention never controls whether a pipe is read. */
export class BoundedProcessOutput {
	private readonly head = new Uint8Array(PROCESS_OUTPUT_HEAD_BYTES);
	private readonly tail = new Uint8Array(PROCESS_OUTPUT_TAIL_BYTES);
	private headLength = 0;
	private tailPosition = 0;
	private tailLength = 0;
	private bytes = 0;

	observe(chunk: Uint8Array): void {
		this.bytes += chunk.byteLength;
		const headBytes = Math.min(chunk.byteLength, this.head.length - this.headLength);
		this.head.set(chunk.subarray(0, headBytes), this.headLength);
		this.headLength += headBytes;
		const retained = chunk.subarray(Math.max(0, chunk.byteLength - this.tail.length));
		const first = Math.min(retained.length, this.tail.length - this.tailPosition);
		this.tail.set(retained.subarray(0, first), this.tailPosition);
		this.tail.set(retained.subarray(first), 0);
		this.tailPosition = (this.tailPosition + retained.length) % this.tail.length;
		this.tailLength = Math.min(this.tail.length, this.tailLength + retained.length);
	}

	snapshot(): { text: string; bytes: number; truncated: boolean } {
		const tail = this.lastBytes(
			Math.min(this.tailLength, Math.max(0, this.bytes - this.headLength)),
		);
		const head = this.head.subarray(0, this.headLength);
		if (this.bytes <= PROCESS_OUTPUT_BYTES) {
			const complete = new Uint8Array(head.length + tail.length);
			complete.set(head);
			complete.set(tail, head.length);
			const text = decoder.decode(complete);
			if (Buffer.byteLength(text, 'utf8') <= PROCESS_OUTPUT_BYTES)
				return { text, bytes: this.bytes, truncated: false };
			// Invalid UTF-8 replacement may increase the text's UTF-8 size.
			return { text: this.truncate(text, text), bytes: this.bytes, truncated: true };
		}
		// Drop partial valid UTF-8 characters at the head/tail cut boundaries.
		const headText = decoder.decode(head, { stream: true });
		decoder.decode();
		let start = 0;
		while (start < 3 && start < tail.length && (tail[start]! & 0xc0) === 0x80) start++;
		return {
			text: this.truncate(headText, decoder.decode(tail.subarray(start))),
			bytes: this.bytes,
			truncated: true,
		};
	}

	private lastBytes(count: number): Uint8Array {
		const bytes = new Uint8Array(count);
		const start = (this.tailPosition - count + this.tail.length) % this.tail.length;
		const first = Math.min(count, this.tail.length - start);
		bytes.set(this.tail.subarray(start, start + first));
		bytes.set(this.tail.subarray(0, count - first), first);
		return bytes;
	}

	private truncate(head: string, tail: string): string {
		const prefix = utf8Prefix(head, PROCESS_OUTPUT_HEAD_BYTES);
		const suffix = utf8Suffix(
			tail,
			PROCESS_OUTPUT_BYTES - Buffer.byteLength(prefix, 'utf8') - markerBytes,
		);
		return prefix + PROCESS_OUTPUT_MARKER + suffix;
	}
}

const utf8Prefix = (text: string, limit: number): string => {
	const bytes = encoder.encode(text);
	const result = decoder.decode(bytes.subarray(0, limit), { stream: true });
	decoder.decode();
	return result;
};

const utf8Suffix = (text: string, limit: number): string => {
	const bytes = encoder.encode(text);
	let start = Math.max(0, bytes.length - limit);
	while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
	return decoder.decode(bytes.subarray(start));
};
