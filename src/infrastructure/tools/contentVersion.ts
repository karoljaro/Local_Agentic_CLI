import { createHash } from 'node:crypto';

// Hash the decoded UTF-8 content, matching the text used by read/edit/replace.
export const contentVersion = (content: string): string =>
	createHash('sha256').update(content, 'utf8').digest('hex');
