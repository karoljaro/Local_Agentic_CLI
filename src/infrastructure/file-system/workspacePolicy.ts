export const PROTECTED_DIRECTORIES = ['node_modules', '.git', '.agent'] as const;

export const SAFE_ENV_BASENAMES = ['.env.development', '.env.dev', '.env.example'] as const;

const protectedDirectories = new Set<string>(PROTECTED_DIRECTORIES);
const safeEnvFiles = new Set<string>(SAFE_ENV_BASENAMES);

export const isProtectedDirectoryPath = (path: string): boolean =>
	path
		.split(/[\\/]+/)
		.filter(Boolean)
		.some(isProtectedDirectoryName);

export const isProtectedFilePath = (path: string): boolean => {
	const parts = path.split(/[\\/]+/).filter(Boolean);
	const name = policyName(parts.pop() ?? '');
	return (
		parts.some(isProtectedDirectoryName) ||
		protectedDirectories.has(name) ||
		(name.startsWith('.env') && !safeEnvFiles.has(name))
	);
};

const isProtectedDirectoryName = (name: string): boolean =>
	protectedDirectories.has(policyName(name)) || policyName(name).startsWith('.env');

const policyName = (name: string): string =>
	process.platform === 'win32' ? name.toLowerCase() : name;
