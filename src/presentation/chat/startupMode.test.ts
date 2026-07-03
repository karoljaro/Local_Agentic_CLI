import { describe, expect, test } from 'bun:test';

import { readStartupMode } from './startupMode';

describe('readStartupMode', () => {
	test('starts a new session by default', () => {
		expect(readStartupMode(['/usr/bin/codesh'])).toBe('new');
	});

	test('opens resume screen for resume argument', () => {
		expect(readStartupMode(['/usr/bin/codesh', 'resume'])).toBe('resume');
		expect(readStartupMode(['bun', 'index.tsx', 'resume'])).toBe('resume');
	});

	test('opens resume screen for --resume argument', () => {
		expect(readStartupMode(['/usr/bin/codesh', '--resume'])).toBe('resume');
	});
});
