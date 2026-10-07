import { chmod, copyFile, mkdir } from 'node:fs/promises';

import { binPathFor } from '@vscode/ripgrep-universal';

const DIST_DIR = 'dist';

const shared = {
	entrypoints: ['./index.tsx'],
	minify: true,
	sourcemap: false,
} satisfies Bun.BuildConfig;

const compile = async (target: Bun.Build.CompileTarget, outfile: string): Promise<void> => {
	await mkdir(DIST_DIR, { recursive: true });

	const result = await Bun.build({
		...shared,
		compile: {
			outfile,
			target,
		},
	});

	if (!result.success) {
		console.error(...result.logs);
		process.exit(1);
	}
};

export const buildLinux = async (): Promise<void> => {
	await compile('bun-linux-x64', `${DIST_DIR}/codesh`);
	await copyFile(binPathFor({ os: 'linux', arch: 'x64' }), `${DIST_DIR}/rg`);
	await chmod(`${DIST_DIR}/codesh`, 0o755);
	await chmod(`${DIST_DIR}/rg`, 0o755);
};

export const buildWindows = async (): Promise<void> => {
	await compile('bun-windows-x64', `${DIST_DIR}/codesh.exe`);
	await copyFile(binPathFor({ os: 'win32', arch: 'x64' }), `${DIST_DIR}/rg.exe`);
};
