import { chmod, mkdir } from 'node:fs/promises';

const outfile = 'dist/local-agentic-cli';

await mkdir('dist', { recursive: true });

const result = await Bun.build({
	entrypoints: ['./index.tsx'],
	outdir: 'dist',
	naming: 'local-agentic-cli',
	target: 'bun',
	packages: 'external',
	banner: '#!/usr/bin/env bun\n',
	minify: true,
	sourcemap: false,
});

if (!result.success) {
	for (const log of result.logs) {
		console.error(log);
	}

	process.exit(1);
}

await chmod(outfile, 0o755);
