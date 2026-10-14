import type {
	GitChangeStatus,
	WorkspaceChange,
	WorkspaceStatus,
} from '@/application/ports/WorkspaceChangesPort';
import { WorkspaceGitError } from '@/application/ports/WorkspaceChangesPort';
import { GIT_MAX_ENTRIES } from './limits';

const statuses = new Set([' ', 'M', 'A', 'D', 'R', 'C', 'T', 'U']);

/** Paths are Git's literal repository-relative bytes decoded as strict UTF-8. */
export const validGitPath = (path: string): boolean =>
	path.length > 0 &&
	!path.includes('\0') &&
	!path.startsWith('/') &&
	path.split('/').every((component) => component !== '' && component !== '.' && component !== '..');

export const parseStatus = (
	bytes: Uint8Array,
	prefix: string,
	outputTruncated = false,
): WorkspaceStatus => {
	let text: string;
	try {
		// A capped stream can end halfway through a UTF-8 character: discard its incomplete record.
		const end = outputTruncated ? bytes.lastIndexOf(0) + 1 : bytes.length;
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end));
	} catch {
		throw malformed('Non-UTF-8 filenames are unsupported; no paths were inspected.');
	}
	if (text && !text.endsWith('\0')) throw malformed();
	const records = text.split('\0');
	records.pop();
	const entries: WorkspaceChange[] = [];
	const seen = new Set<string>();
	let omitted = false;
	let truncated = outputTruncated;
	for (let index = 0; index < records.length; index++) {
		const record = records[index]!;
		const x = record[0];
		const y = record[1];
		const untracked = x === '?' && y === '?';
		if (
			record.length < 4 ||
			record[2] !== ' ' ||
			(!untracked && (!statuses.has(x!) || !statuses.has(y!) || (x === ' ' && y === ' ')))
		)
			throw malformed();
		const path = record.slice(3);
		if (!validGitPath(path)) throw malformed();
		let originalPath: string | undefined;
		if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
			originalPath = records[++index];
			if (originalPath === undefined) {
				if (outputTruncated) break;
				throw malformed();
			}
			if (!validGitPath(originalPath)) throw malformed();
		}
		// Refuse cross-boundary rename/copy pairs rather than exposing the other path or its blob.
		if (
			!path.startsWith(prefix) ||
			(originalPath !== undefined && !originalPath.startsWith(prefix))
		) {
			omitted = true;
			continue;
		}
		const relativePath = path.slice(prefix.length);
		if (!validGitPath(relativePath) || seen.has(relativePath)) throw malformed();
		seen.add(relativePath);
		if (entries.length === GIT_MAX_ENTRIES) {
			truncated = true;
			continue;
		}
		entries.push({
			path: relativePath,
			...(originalPath === undefined ? {} : { originalPath: originalPath.slice(prefix.length) }),
			staged: untracked || x === ' ' ? null : (x as GitChangeStatus),
			unstaged: untracked || y === ' ' ? null : (y as GitChangeStatus),
			untracked,
		});
	}
	return {
		entries,
		truncated,
		...(omitted
			? { notice: 'Paths outside the workspace or renames across its boundary were omitted.' }
			: {}),
	};
};

const malformed = (message = 'Git returned malformed status output. Refresh to try again.') =>
	new WorkspaceGitError('repository-error', message);
