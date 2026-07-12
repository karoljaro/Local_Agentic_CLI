import type { StartupMode } from './types';

export const readStartupMode = (argv: string[]): StartupMode => {
	return argv.slice(1).some((argument) => argument === 'resume' || argument === '--resume')
		? 'resume'
		: 'new';
};
