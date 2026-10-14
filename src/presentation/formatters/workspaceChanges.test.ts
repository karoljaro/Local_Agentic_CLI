import { expect, test } from 'bun:test';
import {
	boundedDiffText,
	changeLabel,
	DIFF_RENDER_BYTES,
	DIFF_RENDER_LINES,
	safeWorkspaceText,
} from './workspaceChanges';

test('control and directional characters are visible escapes, while Unicode paths remain readable', () => {
	const text = 'Zażółć\t\n\r\u001b]0;title\u0007\u009b\u202e';
	const safe = safeWorkspaceText(text);
	expect(safe).toBe('Zażółć\\t\\n\\r\\u001b]0;title\\u0007\\u009b\\u202e');
	expect(safeWorkspaceText('a\nb\tc', true)).toBe('a\nb\\tc');
	expect(changeLabel({ path: text, staged: 'M', unstaged: 'M', untracked: false })).toBe(
		`MM  ${safe}`,
	);
	expect(
		changeLabel({
			path: 'new',
			originalPath: 'old\nname',
			staged: 'R',
			unstaged: null,
			untracked: false,
		}),
	).toBe('R·  old\\nname → new');
});

test('diff headers, hunks and +/-/context stay literal and rendering respects byte and line caps', () => {
	const diff =
		'diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n context';
	expect(boundedDiffText(diff)).toEqual({ text: `${diff}\n`, truncated: false });
	const escaped = boundedDiffText('\u001b'.repeat(DIFF_RENDER_BYTES));
	expect(Buffer.byteLength(escaped.text)).toBeLessThanOrEqual(DIFF_RENDER_BYTES);
	expect(escaped.truncated).toBe(true);
	expect(escaped.text).not.toContain('\u001b');
	const long = boundedDiffText(
		Array.from({ length: DIFF_RENDER_LINES + 20 }, (_, index) => `+line${index}`).join('\n'),
	);
	expect(long.text.split('\n')).toHaveLength(DIFF_RENDER_LINES + 1);
	expect(long.truncated).toBe(true);
});
