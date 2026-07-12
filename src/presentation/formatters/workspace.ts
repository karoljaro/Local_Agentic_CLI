export const formatWorkspacePath = (workspacePath: string): string => {
	const homeDirectory = process.env['HOME'];
	if (homeDirectory === undefined) {
		return workspacePath;
	}

	if (workspacePath === homeDirectory) {
		return '~';
	}

	return workspacePath.startsWith(`${homeDirectory}/`)
		? `~/${workspacePath.slice(homeDirectory.length + 1)}`
		: workspacePath;
};

export const compactSessionId = (sessionId: string): string => {
	return sessionId.length <= 28 ? sessionId : `${sessionId.slice(0, 12)}…${sessionId.slice(-12)}`;
};
