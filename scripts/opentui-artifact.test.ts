import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import { ARTIFACT_BUILD_OPTIONS } from './build-artifact';

test.skipIf(process.platform !== 'linux' || process.arch !== 'x64')(
	'compiled OpenTUI renders with embedded native assets from an isolated directory',
	async () => {
		const directory = await mkdtemp(join(tmpdir(), 'codesh-opentui-artifact-'));
		const entrypoint = join(directory, 'probe.ts');
		const executable = join(directory, 'probe');
		const core = fileURLToPath(import.meta.resolve('@opentui/core'));
		const testing = fileURLToPath(import.meta.resolve('@opentui/core/testing'));
		const markdown =
			'# Artifact heading\n\n**Strong text** and readable prose.\n\n```ts\nconst answer = 42;\n```';

		try {
			await writeFile(
				entrypoint,
				`import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CodeRenderable, MarkdownRenderable, SyntaxStyle, TextRenderable, TreeSitterClient } from ${JSON.stringify(core)};
import { createTestRenderer } from ${JSON.stringify(testing)};
const dataPath = join(process.cwd(), 'parser-data');
const parser = new TreeSitterClient({ dataPath });
const workerLogs = [];
const errors = [];
parser.on('worker:log', (level, message) => {
  workerLogs.push(message);
  if (level === 'error' || level === 'warn') errors.push(message);
});
parser.on('error', (message) => errors.push(message));
parser.on('warning', (message) => errors.push(message));
const setup = await createTestRenderer({ width: 60, height: 12, useThread: false });
const syntax = SyntaxStyle.fromStyles({ default: { fg: '#ffffff' }, 'markup.heading': { bold: true }, 'markup.strong': { bold: true } });
let frame;
let highlights;
try {
  await parser.initialize();
  highlights = await parser.highlightOnce(${JSON.stringify(markdown)}, 'markdown');
  setup.renderer.root.add(new TextRenderable(setup.renderer, { content: 'OpenTUI native artifact', height: 1 }));
  const markdown = new MarkdownRenderable(setup.renderer, { content: ${JSON.stringify(markdown)}, syntaxStyle: syntax, treeSitterClient: parser, width: '100%' });
  setup.renderer.root.add(markdown);
  await setup.renderOnce();
  const pending = [];
  const collect = (node) => {
    if (node instanceof CodeRenderable) pending.push(node.highlightingDone);
    for (const child of node.getChildren()) collect(child);
  };
  collect(markdown);
  await Promise.all(pending);
  await setup.renderOnce();
  frame = setup.captureCharFrame();
} finally {
  setup.renderer.destroy();
  syntax.destroy();
  await parser.destroy();
}
console.log(JSON.stringify({ frame, highlights, errors, workerLogs, cacheDirectories: await readdir(join(dataPath, 'tree-sitter')), assets: Bun.embeddedFiles.map((file) => file.name) }));
`,
			);

			const result = await Bun.build({
				...ARTIFACT_BUILD_OPTIONS,
				entrypoints: [entrypoint],
				compile: { target: 'bun-linux-x64', outfile: executable },
			});

			if (!result.success) {
				throw new Error(result.logs.map(String).join('\n'));
			}

			const child = Bun.spawn([executable], {
				cwd: directory,
				env: { ...process.env, OTUI_ASSET_ROOT: '', OTUI_TREE_SITTER_WORKER_PATH: '' },
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
				timeout: 10_000,
			});
			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);

			if (exitCode !== 0) {
				throw new Error(`OpenTUI artifact exited with code ${exitCode}: ${stderr || stdout}`);
			}

			const output = JSON.parse(stdout.trim()) as {
				frame: string;
				assets: string[];
				highlights: {
					error?: string;
					warning?: string;
					highlights?: Array<[number, number, string]>;
				};
				errors: string[];
				workerLogs: string[];
				cacheDirectories: string[];
			};
			expect(output.frame).toContain('OpenTUI native artifact');
			expect(output.frame).toContain('Artifact heading');
			expect(output.frame).toContain('Strong text');
			expect(output.frame).toContain('const answer = 42;');
			expect(output.frame).not.toContain('# Artifact');
			expect(output.frame).not.toContain('**Strong');
			expect(output.highlights.error).toBeUndefined();
			expect(output.highlights.warning).toBeUndefined();
			const groups = output.highlights.highlights?.map((highlight) => highlight[2]) ?? [];
			expect(groups).toContain('markup.heading.1');
			expect(groups).toContain('markup.strong');
			expect(groups.some((group) => group.startsWith('keyword'))).toBe(true);
			expect(output.errors).toEqual([]);
			expect(output.cacheDirectories.sort()).toEqual(['languages', 'queries']);
			const loads = output.workerLogs.filter((message) =>
				message.startsWith('Loading from local path:'),
			);
			expect(loads.length).toBeGreaterThan(0);
			expect(loads.every((message) => message.includes('/$bunfs/root/'))).toBe(true);
			expect(
				output.workerLogs.some((message) => /Downloading|Loaded from cache/.test(message)),
			).toBe(false);
			expect(output.assets.some((name) => /libopentui.*\.so$/.test(name))).toBe(true);
			expect(output.assets.some((name) => /parser\.worker.*\.js$/.test(name))).toBe(true);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
	30_000,
);
