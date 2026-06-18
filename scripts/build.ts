import { chmod, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });

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

await chmod('dist/local-agentic-cli', 0o755);

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