import type { WorkspaceChange } from '@/application/ports/WorkspaceChangesPort';

/** Escape terminal controls and directional overrides without changing path identity. */
export const safeWorkspaceText = (text: string, multiline = false): string =>
	text.replace(
		/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
		(character) => {
			if (multiline && character === '\n') return '\n';
			if (character === '\n') return '\\n';
			if (character === '\r') return '\\r';
			if (character === '\t') return '\\t';
			return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
		},
	);

export const changeLabel = (entry: WorkspaceChange): string =>
	`${entry.untracked ? '??' : `${entry.staged ?? '·'}${entry.unstaged ?? '·'}`}  ${
		entry.originalPath === undefined
			? safeWorkspaceText(entry.path)
			: `${safeWorkspaceText(entry.originalPath)} → ${safeWorkspaceText(entry.path)}`
	}`;

export const DIFF_RENDER_BYTES = 128 * 1_024;
export const DIFF_RENDER_LINES = 2_000;

export const boundedDiffText = (text: string): { text: string; truncated: boolean } => {
	if (!text) return { text: '', truncated: false };
	const lines = text.split('\n');
	let remaining = DIFF_RENDER_BYTES;
	const kept: string[] = [];
	let truncated = lines.length > DIFF_RENDER_LINES;
	for (const line of lines.slice(0, DIFF_RENDER_LINES)) {
		const safe = safeWorkspaceText(line);
		const bytes = new TextEncoder().encode(`${safe}\n`);
		if (bytes.length > remaining) {
			kept.push(
				new TextDecoder('utf-8', { fatal: false })
					.decode(bytes.subarray(0, remaining))
					.replace(/\ufffd$/, ''),
			);
			truncated = true;
			break;
		}
		kept.push(`${safe}\n`);
		remaining -= bytes.length;
	}
	return { text: kept.join(''), truncated };
};
