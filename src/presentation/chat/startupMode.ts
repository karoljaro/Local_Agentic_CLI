export type StartupMode = 'new' | 'resume';

export const readStartupMode = (argv: string[]): StartupMode => {
	return argv.slice(1).some((arg) => arg === 'resume' || arg === '--resume') ? 'resume' : 'new';
};
