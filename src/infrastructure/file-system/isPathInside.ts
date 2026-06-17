import { isAbsolute, relative } from 'node:path';

export const isPathInside = (
	parentPath: string,
	childPath: string,
): boolean => {
	const relativePath = relative(parentPath, childPath);

	return (
		relativePath.length === 0 ||
		(!relativePath.startsWith('..') && !isAbsolute(relativePath))
	);
};
