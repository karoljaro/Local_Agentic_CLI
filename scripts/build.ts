import { chmod, copyFile, mkdir } from 'node:fs/promises';

import { binPathFor } from '@vscode/ripgrep-universal';

await mkdir('dist', { recursive: true });

const ripgrepBinaries = {
	linux: {
		source: binPathFor({ os: 'linux', arch: 'x64' }),
		output: 'dist/rg',
	},
	windows: {
		source: binPathFor({ os: 'win32', arch: 'x64' }),
		output: 'dist/rg.exe',
	},
} as const;

const shared = {
	entrypoints: ['./index.tsx'],
	minify: true,
	sourcemap: false,
} satisfies Bun.BuildConfig;

const linux = await Bun.build({
	...shared,
	outdir: 'dist',
	naming: 'local-agentic-cli',
	target: 'bun',
	packages: 'external',
	banner: '#!/usr/bin/env bun\n',
});

if (!linux.success) {
	console.error(...linux.logs);
	process.exit(1);
}

await copyFile(ripgrepBinaries.linux.source, ripgrepBinaries.linux.output);
await chmod('dist/local-agentic-cli', 0o755);
await chmod(ripgrepBinaries.linux.output, 0o755);

const windows = await Bun.build({
	...shared,
	compile: {
		outfile: 'dist/local-agentic-cli.exe',
		target: 'bun-windows-x64',
	},
});

if (!windows.success) {
	console.error(...windows.logs);
	process.exit(1);
}

await copyFile(ripgrepBinaries.windows.source, ripgrepBinaries.windows.output);
