import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const distExecutable =
	process.platform === 'win32' ? resolve('dist/codesh.exe') : resolve('dist/codesh');
const distRipgrep = process.platform === 'win32' ? resolve('dist/rg.exe') : resolve('dist/rg');

type RunResult = {
	stdout: string;
	stderr: string;
};

async function run(cmd: string[], cwd: string): Promise<RunResult> {
	const child = Bun.spawn({
		cmd,
		cwd,
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 5000,
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
}

await access(distExecutable);
await access(distRipgrep);

const ripgrep = await run([distRipgrep, '--version'], process.cwd());

if (!ripgrep.stdout.toLowerCase().includes('ripgrep')) {
	throw new Error(`${distRipgrep} did not print a ripgrep version.`);
}

const workspace = await mkdtemp(join(tmpdir(), 'codesh-smoke-'));

try {
	await run([distExecutable], workspace);
} finally {
	await rm(workspace, { recursive: true, force: true });
}
