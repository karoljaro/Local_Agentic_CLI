import { describe, expect, test } from 'bun:test';

import { readBoundedResponseText } from './readBoundedResponseText';

describe('readBoundedResponseText', () => {
	test('stops reading after the error body limit and cancels the stream', async () => {
		let pullCount = 0;
		let wasCancelled = false;

		const response = new Response(
			new ReadableStream<Uint8Array>({
				pull(controller) {
					pullCount += 1;
					controller.enqueue(new TextEncoder().encode('x'.repeat(1200)));
				},
				cancel() {
					wasCancelled = true;
				},
			}),
		);

		await expect(readBoundedResponseText(response)).resolves.toBe(`${'x'.repeat(1000)}...`);
		expect(pullCount).toBe(1);
		expect(wasCancelled).toBe(true);
	});

	test('returns an empty string for responses without a body', async () => {
		await expect(readBoundedResponseText(new Response(null))).resolves.toBe('');
	});
});
