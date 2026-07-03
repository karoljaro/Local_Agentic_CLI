export const formatWorkspacePath = (workspacePath: string): string => {
	const homeDirectory = process.env['HOME'];

	if (homeDirectory === undefined) {
		return workspacePath;
	}

	if (workspacePath === homeDirectory) {
		return '~';
	}

	if (workspacePath.startsWith(`${homeDirectory}/`)) {
		return `~/${workspacePath.slice(homeDirectory.length + 1)}`;
	}

	return workspacePath;
};
