import { describe, expect, test } from 'bun:test';

import { readStartupMode } from './startupMode';

describe('readStartupMode', () => {
	test('supports default, resume, and --resume startup', () => {
		expect(readStartupMode(['/usr/bin/codesh'])).toBe('new');
		expect(readStartupMode(['/usr/bin/codesh', 'resume'])).toBe('resume');
		expect(readStartupMode(['bun', 'index.tsx', '--resume'])).toBe('resume');
	});
});
