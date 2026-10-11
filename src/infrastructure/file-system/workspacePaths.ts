import { isAbsolute, posix, sep, win32 } from 'node:path';
import { isPathInside } from './isPathInside';

export const isProgramPath = (program: string): boolean =>
	/[\\/]/.test(program) || /^[A-Za-z]:/.test(program) || program === '.' || program === '..';

// Shared confinement policy. Protected file-tool paths are a separate policy.
export const validateWorkspaceRelativePath = (inputPath: string): void => {
	if (!inputPath.trim().length) throw new Error('File path cannot be empty.');
	if (isAbsolute(inputPath) || win32.isAbsolute(inputPath) || /^[A-Za-z]:/.test(inputPath))
		throw new Error('Workspace file path must be relative.');
	if (inputPath.includes('\\') || inputPath.includes('\0'))
		throw new Error('Workspace paths must use / separators and contain no null characters.');
	if (process.platform === 'win32' && inputPath.includes(':'))
		throw new Error('Workspace paths cannot select Windows alternate data streams.');
	if (
		process.platform === 'win32' &&
		inputPath
			.split('/')
			.some(
				(part) =>
					part !== '.' &&
					part !== '..' &&
					(/[. ]$/.test(part) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)),
			)
	)
		throw new Error(`Unsupported Windows path component: ${inputPath}`);
};

export const normalizedPath = (path: string): string => path.split(sep).join('/');

export const assertContained = (root: string, target: string, input: string): void => {
	if (!isPathInside(root, target))
		throw new Error(`Cannot access file outside workspace: ${input}`);
};

export const workspaceRelativePath = (inputPath: string): string => {
	validateWorkspaceRelativePath(inputPath);
	// Pure lexical normalization; neither schema parsing nor preparation performs IO.
	const normalized = posix.normalize(inputPath);
	if (normalized === '..' || normalized.startsWith('../'))
		throw new Error(`Cannot access file outside workspace: ${inputPath}`);
	return normalized.replace(/\/$/, '') || '.';
};
