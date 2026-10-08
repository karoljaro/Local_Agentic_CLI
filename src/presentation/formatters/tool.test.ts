import { describe, expect, test } from 'bun:test';

import { describeToolRequest, formatToolName, getPrimaryToolTarget } from './tool';

describe('tool request formatting', () => {
	test('shows both paths when approving a file move', () => {
		expect(
			describeToolRequest('move_file', {
				source: ' src/old.ts ',
				destination: 'src/new.ts',
			}),
		).toBe('Move file · src/old.ts → src/new.ts');
	});

	test('keeps both long move paths visible and the target bounded', () => {
		const target = getPrimaryToolTarget({ source: 'a'.repeat(150), destination: 'b'.repeat(150) });
		expect(target).toBe(`${'a'.repeat(47)}… → ${'b'.repeat(47)}…`);
		expect(target!.length).toBeLessThanOrEqual(100);
	});

	test.each([
		['list_directory', 'List directory'],
		['find_files', 'Find files'],
		['search_text', 'Search text'],
		['replace_file', 'Replace file'],
		['delete_path', 'Delete path'],
		['list_files', 'List files'],
		['search_file', 'Search workspace'],
	])('labels current and historical tool names: %s', (name, label) => {
		expect(formatToolName(name)).toBe(label);
	});

	test('renders missing or malformed targets without raw input details', () => {
		expect(describeToolRequest('move_file', {})).toBe('Move file');
		expect(describeToolRequest('delete_path', { path: 42 })).toBe('Delete path');
		expect(getPrimaryToolTarget(null)).toBeUndefined();
		expect(getPrimaryToolTarget({ source: 'before.ts' })).toBe('before.ts');
	});
});
