import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Disposable local helper; no network, dependencies, model calls or repository writes.
export const PROCESS_FIXTURE_NAME = 'process-helper.js';
export const PROCESS_FIXTURE_LARGE_BYTES = 1_048_584;

export const writeProcessFixture = async (workspace: string): Promise<void> => {
	await writeFile(
		join(workspace, PROCESS_FIXTURE_NAME),
		`
import { readSync, writeSync } from 'node:fs';
const mode = process.argv[2];
if (mode === 'success') writeSync(1, 'stdout ok\\n');
else if (mode === 'failure') {
  writeSync(1, 'before failure\\n'); writeSync(2, 'stderr failure\\n'); process.exitCode = 7;
} else if (mode === 'argv') writeSync(1, JSON.stringify(process.argv.slice(3)));
else if (mode === 'cwd') writeSync(1, process.cwd());
else if (mode === 'large') {
  writeSync(1, 'HEAD'); writeSync(2, 'HEAD');
  const chunk = Buffer.alloc(16384, 120);
  for (let i = 0; i < 64; i++) { writeSync(1, chunk); writeSync(2, chunk); }
  writeSync(1, 'TAIL'); writeSync(2, 'TAIL');
} else if (mode === 'binary') {
  writeSync(1, new Uint8Array([255, 254, 97])); writeSync(2, new Uint8Array([128, 98]));
} else if (mode === 'stdin') {
  const bytes = readSync(0, Buffer.alloc(1), 0, 1, null);
  writeSync(1, JSON.stringify({ bytes, stdinTTY: !!process.stdin.isTTY, stdoutTTY: !!process.stdout.isTTY }));
} else if (mode === 'wait' || mode === 'ignore-term') {
  if (mode === 'ignore-term') process.on('SIGTERM', () => writeSync(2, 'ignored SIGTERM\\n'));
  writeSync(1, 'ready\\n'); setInterval(() => {}, 100);
} else { writeSync(2, 'unknown helper mode'); process.exitCode = 2; }
`,
	);
};
