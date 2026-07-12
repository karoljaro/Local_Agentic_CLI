import { describe, expect, test } from 'bun:test';

import { StreamBuffer } from './StreamBuffer';

describe('StreamBuffer', () => {
	test('batches deltas and flushes all content without loss', () => {
		const stream = new StreamBuffer(10_000);
		let notifications = 0;
		stream.subscribe(() => {
			notifications += 1;
		});

		stream.push('hel');
		stream.push('lo');

		expect(stream.getSnapshot()).toBe('');
		expect(stream.flush()).toBe('hello');
		expect(stream.getSnapshot()).toBe('hello');
		expect(notifications).toBe(1);
		stream.dispose();
	});

	test('start and reset remove pending timers and previous content', () => {
		const stream = new StreamBuffer(10_000);
		stream.push('old');
		stream.flush();
		stream.push('pending');

		stream.start();

		expect(stream.getSnapshot()).toBe('');
		expect(stream.flush()).toBe('');
		stream.dispose();
	});
});
