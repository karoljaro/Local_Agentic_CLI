import { chmod, copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { validateReleaseArtifacts } from './release-artifacts';

type RunResult = {
	stdout: string;
	stderr: string;
};

const DIST_DIRECTORY = resolve('dist');
const RUN_TIMEOUT_MS = 10_000;

const run = async (cmd: string[], cwd: string): Promise<RunResult> => {
	const child = Bun.spawn({
		cmd,
		cwd,
		env: {
			...process.env,
			OLLAMA_BASE_URL: 'http://127.0.0.1:1',
			OLLAMA_MODEL: 'release-smoke-model',
			OLLAMA_KEEP_ALIVE: '0',
		},
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: RUN_TIMEOUT_MS,
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);

	if (exitCode !== 0) {
		throw new Error(`${cmd[0]} exited with code ${exitCode}\n${stderr || stdout}`);
	}

	return { stdout, stderr };
};

const assertIncludes = (actual: string, expected: string, command: string): void => {
	if (!actual.includes(expected)) {
		throw new Error(`${command} output did not include ${JSON.stringify(expected)}.\n${actual}`);
	}
};

await validateReleaseArtifacts(DIST_DIRECTORY);

const smokeRoot = await mkdtemp(join(tmpdir(), 'codesh-release-smoke-'));
const releaseDirectory = join(smokeRoot, 'release');
const workspaceDirectory = join(smokeRoot, 'workspace');
const executableName = process.platform === 'win32' ? 'codesh.exe' : 'codesh';
const ripgrepName = process.platform === 'win32' ? 'rg.exe' : 'rg';
const executable = join(releaseDirectory, executableName);
const ripgrep = join(releaseDirectory, ripgrepName);

try {
	await mkdir(releaseDirectory);
	await mkdir(workspaceDirectory);
	await copyFile(join(DIST_DIRECTORY, executableName), executable);
	await copyFile(join(DIST_DIRECTORY, ripgrepName), ripgrep);

	if (process.platform !== 'win32') {
		await chmod(executable, 0o755);
		await chmod(ripgrep, 0o755);
	}

	await writeFile(join(workspaceDirectory, 'smoke.txt'), 'release-smoke-marker\n');

	const ripgrepVersion = await run([ripgrep, '--version'], workspaceDirectory);
	assertIncludes(ripgrepVersion.stdout, 'ripgrep', `${basename(ripgrep)} --version`);

	const ripgrepSearch = await run(
		[ripgrep, '--fixed-strings', 'release-smoke-marker', '.'],
		workspaceDirectory,
	);
	assertIncludes(ripgrepSearch.stdout, 'smoke.txt', `${basename(ripgrep)} search`);

	for (const args of [[], ['resume']] as const) {
		await run([executable, ...args], workspaceDirectory);
	}
} finally {
	await rm(smokeRoot, { recursive: true, force: true });
}
