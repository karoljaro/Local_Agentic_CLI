import { describe, expect, test } from 'bun:test';
import {
	BoundedProcessOutput,
	PROCESS_OUTPUT_BYTES,
	PROCESS_OUTPUT_MARKER,
} from './BoundedProcessOutput';

const observe = (bytes: Uint8Array, chunkSize: number) => {
	const output = new BoundedProcessOutput();
	for (let start = 0; start < bytes.length; start += chunkSize)
		output.observe(bytes.subarray(start, start + chunkSize));
	return output.snapshot();
};

describe('fixed process output retention', () => {
	for (const length of [0, 1, 2047, 2048, 6144, 8191, 8192])
		test(`complete ASCII output at ${length} bytes`, () => {
			const text = 'a'.repeat(length);
			expect(observe(Buffer.from(text), 31)).toEqual({ text, bytes: length, truncated: false });
		});
	for (const chunkSize of [1, 31, 2048, 6144, 8192, 100000])
		test(`bounded head/tail with chunk size ${chunkSize}`, () => {
			const source = Buffer.from('HEAD' + 'x'.repeat(50000) + 'TAIL');
			const output = observe(source, chunkSize);
			expect(output.bytes).toBe(source.length);
			expect(output.truncated).toBe(true);
			expect(output.text.startsWith('HEAD')).toBe(true);
			expect(output.text.endsWith('TAIL')).toBe(true);
			expect(output.text).toContain(PROCESS_OUTPUT_MARKER);
			expect(Buffer.byteLength(output.text)).toBe(PROCESS_OUTPUT_BYTES);
		});
	test('retains valid multibyte text without boundary replacement', () => {
		const source = Buffer.from('🐈α界'.repeat(3000));
		const output = observe(source, 17);
		expect(output.bytes).toBe(source.length);
		expect(output.text).not.toContain('\ufffd');
		expect(Buffer.byteLength(output.text)).toBeLessThanOrEqual(PROCESS_OUTPUT_BYTES);
		expect(output.truncated).toBe(true);
	});
	test('decodes invalid binary output with replacement and truthful observed byte counts', () => {
		expect(observe(new Uint8Array([0xff, 0xfe, 0x61]), 1)).toEqual({
			text: '\ufffd\ufffda',
			bytes: 3,
			truncated: false,
		});
		const output = observe(new Uint8Array(8192).fill(0xff), 97);
		expect(output.bytes).toBe(8192);
		expect(output.text).toContain('\ufffd');
		expect(output.text).toContain(PROCESS_OUTPUT_MARKER);
		expect(Buffer.byteLength(output.text)).toBeLessThanOrEqual(PROCESS_OUTPUT_BYTES);
		expect(output.truncated).toBe(true); // Replacement expansion is capped too.
	});
	test('incremental snapshots preserve the final tail and do not affect later observations', () => {
		const output = new BoundedProcessOutput();
		output.observe(Buffer.from('α'.repeat(7000)));
		expect(output.snapshot().bytes).toBe(14000);
		output.observe(Buffer.from('final tail'));
		expect(output.snapshot().text.endsWith('final tail')).toBe(true);
		expect(output.snapshot().bytes).toBe(14010);
	});
});
