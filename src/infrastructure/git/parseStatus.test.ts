import { expect, test } from 'bun:test';
import { GIT_MAX_ENTRIES } from './limits';
import { parseStatus } from './parseStatus';

const bytes = (text: string) => new TextEncoder().encode(text);

test('clean, unstaged, staged, both columns, untracked, deletion, type change and conflict', () => {
	expect(parseStatus(bytes(''), '')).toEqual({ entries: [], truncated: false });
	const result = parseStatus(
		bytes(' M modified\0A  added\0MM both\0?? new\0 D deleted\0T  type\0UU conflict\0'),
		'',
	);
	expect(result.entries).toEqual([
		{ path: 'modified', staged: null, unstaged: 'M', untracked: false },
		{ path: 'added', staged: 'A', unstaged: null, untracked: false },
		{ path: 'both', staged: 'M', unstaged: 'M', untracked: false },
		{ path: 'new', staged: null, unstaged: null, untracked: true },
		{ path: 'deleted', staged: null, unstaged: 'D', untracked: false },
		{ path: 'type', staged: 'T', unstaged: null, untracked: false },
		{ path: 'conflict', staged: 'U', unstaged: 'U', untracked: false },
	]);
});

test('NUL rename/copy pairs are destination then source, including unusual literal paths', () => {
	const path = 'Zażółć tabs\tnewline\n\u001b[31m "quoted" \\file';
	const result = parseStatus(bytes(`RM ${path}\0old name\0C  copy\0source\0`), '');
	expect(result.entries).toEqual([
		{ path, originalPath: 'old name', staged: 'R', unstaged: 'M', untracked: false },
		{ path: 'copy', originalPath: 'source', staged: 'C', unstaged: null, untracked: false },
	]);
});

test('nested workspace strips its prefix and refuses parent paths and cross-boundary pairs', () => {
	const result = parseStatus(
		bytes(' M app/file\0 M unrelated\0R  app/new\0outside\0?? appish/file\0'),
		'app/',
	);
	expect(result.entries.map((entry) => entry.path)).toEqual(['file']);
	expect(result.notice).toContain('outside the workspace');
	expect(JSON.stringify(result)).not.toContain('unrelated');
});

test.each([
	' M missing-null',
	'XX path\0',
	'?? \0',
	'  unchanged\0',
	'R  new\0',
	' M ../escape\0',
	' M /absolute\0',
	' M a/../b\0',
	' M duplicate\0 M duplicate\0',
	'!! ignored\0',
])('rejects malformed status: %j', (text) => {
	expect(() => parseStatus(bytes(text), '')).toThrow();
});

test('invalid UTF-8 cannot become a different executable path', () => {
	expect(() => parseStatus(new Uint8Array([32, 77, 32, 255, 0]), '')).toThrow('Non-UTF-8');
});

test('entry cap and byte-truncated records preserve complete entries and label incompleteness', () => {
	const result = parseStatus(
		bytes(Array.from({ length: GIT_MAX_ENTRIES + 20 }, (_, index) => `?? file${index}\0`).join('')),
		'',
	);
	expect(result.entries).toHaveLength(GIT_MAX_ENTRIES);
	expect(result.truncated).toBe(true);
	const partial = parseStatus(bytes(' M complete\0R  incomplete\0'), '', true);
	expect(partial.entries.map((entry) => entry.path)).toEqual(['complete']);
	expect(partial.truncated).toBe(true);
	const splitUtf8 = new Uint8Array([...bytes('?? complete\0?? '), 0xc3]);
	expect(parseStatus(splitUtf8, '', true).entries.map((entry) => entry.path)).toEqual(['complete']);
});
