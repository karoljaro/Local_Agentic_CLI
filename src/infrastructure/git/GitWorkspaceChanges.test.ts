import { expect, test } from 'bun:test';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkspaceChange } from '@/application/ports/WorkspaceChangesPort';
import type { OwnedProcess } from '@/infrastructure/process/BunProcessRunner';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import type { GitSpawnOptions } from './BoundedGitProcess';
import { GitWorkspaceChanges } from './GitWorkspaceChanges';
import { GIT_DIFF_BYTES, GIT_STATUS_BYTES } from './limits';

const entry: WorkspaceChange = { path: 'file', staged: 'M', unstaged: 'M', untracked: false };
const encode = (text: string) => new TextEncoder().encode(text);
const result = (stdout: string | Uint8Array, stderr = '', exitCode = 0): OwnedProcess => {
	const stream = (bytes: Uint8Array) =>
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes);
				controller.close();
			},
		});
	return {
		stdout: stream(typeof stdout === 'string' ? encode(stdout) : stdout),
		stderr: stream(encode(stderr)),
		exited: Promise.resolve(exitCode),
		exitCode,
		signalCode: null,
		kill: () => {},
	};
};

const setup = async (nested = false) => {
	const temp = await createTempDirectory('phase20-git-fake-');
	const workspace = nested ? join(temp.directory, 'app') : temp.directory;
	if (nested) await mkdir(workspace);
	const calls: GitSpawnOptions[] = [];
	const data = {
		root: `${temp.directory}\n`,
		status: '',
		diff: '',
		filters: '',
		stderr: '',
		code: 0,
	};
	const git = new GitWorkspaceChanges(workspace, (options) => {
		calls.push(options);
		if (options.cmd.includes('rev-parse')) return result(data.root, data.stderr, data.code);
		if (options.cmd.includes('config')) return result(data.filters, '', data.filters ? 0 : 1);
		if (options.cmd.includes('status')) return result(data.status);
		return result(data.diff);
	});
	return { ...temp, workspace, calls, data, git, signal: new AbortController().signal };
};

test('clean and staged/unstaged/untracked status comes through the fixed adapter', async () => {
	const f = await setup();
	try {
		expect(await f.git.status(f.signal)).toEqual({ entries: [], truncated: false });
		f.data.status = ' M modified\0A  added\0MM both\0?? new\0 D deleted\0R  rename\0old\0';
		const status = await f.git.status(f.signal);
		expect(status.entries).toHaveLength(6);
		expect(status.entries[2]).toMatchObject({ staged: 'M', unstaged: 'M' });
		expect(status.entries[5]).toMatchObject({ path: 'rename', originalPath: 'old', staged: 'R' });
		expect(f.calls.at(-1)!.cmd.slice(-2)).toEqual(['--', '.']);
	} finally {
		await f.cleanup();
	}
});

test('nested workspace excludes parent entries, preserves a literal path argv and both rename endpoints', async () => {
	const f = await setup(true);
	try {
		const path = '--odd :(top)* \t\nż';
		f.data.status = `MM app/${path}\0 M outside\0R  app/new\0app/old\0`;
		const status = await f.git.status(f.signal);
		expect(status.entries.map((change) => change.path)).toEqual([path, 'new']);
		await f.git.diff(status.entries[0]!, 'unstaged', f.signal);
		let command = f.calls.at(-1)!.cmd;
		expect(command.slice(command.indexOf('--') + 1)).toEqual([path]);
		await f.git.diff(status.entries[1]!, 'staged', f.signal);
		command = f.calls.at(-1)!.cmd;
		expect(command.slice(command.indexOf('--') + 1)).toEqual(['new', 'old']);
		expect(f.calls.every((call) => call.cwd === f.workspace)).toBe(true);
	} finally {
		await f.cleanup();
	}
});

test('untracked inspection and unavailable kind execute no Git processes', async () => {
	const f = await setup();
	try {
		expect(await f.git.diff({ ...entry, untracked: true }, 'unstaged', f.signal)).toMatchObject({
			text: '',
			notice: 'Untracked file — no Git diff yet.',
		});
		expect(await f.git.diff({ ...entry, staged: null }, 'staged', f.signal)).toMatchObject({
			text: '',
		});
		expect(f.calls).toHaveLength(0);
	} finally {
		await f.cleanup();
	}
});

test('deleted/missing path, binary output and empty/stale diff remain readable states', async () => {
	const f = await setup();
	try {
		f.data.diff = 'diff --git a/file b/file\nBinary files a/file and b/file differ\n';
		expect(await f.git.diff(entry, 'unstaged', f.signal)).toMatchObject({
			text: f.data.diff,
			notice: expect.stringContaining('binary difference'),
		});
		f.data.diff = '';
		expect(
			await f.git.diff({ ...entry, staged: 'D', unstaged: null }, 'staged', f.signal),
		).toMatchObject({ text: '', notice: expect.stringContaining('stale') });
		f.data.diff =
			'@@ -1 +1 @@\n-Binary files a/file and b/file differ\n+Binary files a/file and b/file differ\n';
		expect((await f.git.diff(entry, 'unstaged', f.signal)).notice).toBeUndefined();
	} finally {
		await f.cleanup();
	}
});

test('an unstaged rename preview and a copy preview cannot include changes to the original source', async () => {
	const f = await setup();
	try {
		for (const changed of [
			{ ...entry, path: 'new', originalPath: 'source', staged: 'R' as const },
			{ ...entry, path: 'new', originalPath: 'source', staged: 'C' as const },
		]) {
			await f.git.diff(changed, 'unstaged', f.signal);
			const argv = f.calls.at(-1)!.cmd;
			expect(argv.slice(argv.indexOf('--') + 1)).toEqual(['new']);
		}
		await f.git.diff(
			{ ...entry, path: 'copy', originalPath: 'source', staged: 'C' },
			'staged',
			f.signal,
		);
		const argv = f.calls.at(-1)!.cmd;
		expect(argv.slice(argv.indexOf('--') + 1)).toEqual(['copy']);
	} finally {
		await f.cleanup();
	}
});

test('configured clean/process/smudge filters report a limitation before status/diff can run', async () => {
	const f = await setup();
	try {
		f.data.filters = 'filter.lfs.clean\0filter.lfs.process\0filter.lfs.required\0';
		await expect(f.git.status(f.signal)).rejects.toThrow('Git content filters are configured');
		await expect(f.git.diff(entry, 'unstaged', f.signal)).rejects.toThrow(
			'Git content filters are configured',
		);
		expect(f.calls.some((call) => call.cmd.includes('status') || call.cmd.includes('diff'))).toBe(
			false,
		);
		f.data.filters = 'filter.unusual name.clean\0';
		const before = f.calls.length;
		await expect(f.git.status(f.signal)).rejects.toThrow('Unsupported Git filter');
		expect(f.calls.slice(before).some((call) => call.cmd.includes('status'))).toBe(false);
	} finally {
		await f.cleanup();
	}
});

test('large status/diff are bounded and incomplete; malformed complete status is rejected', async () => {
	const f = await setup();
	try {
		f.data.status = Array.from(
			{ length: GIT_STATUS_BYTES / 8 },
			(_, index) => `?? file${index}\0`,
		).join('');
		expect(await f.git.status(f.signal)).toMatchObject({
			entries: expect.any(Array),
			truncated: true,
		});
		f.data.diff = '+' + 'x'.repeat(GIT_DIFF_BYTES * 4);
		const diff = await f.git.diff(entry, 'unstaged', f.signal);
		expect(Buffer.byteLength(diff.text)).toBe(GIT_DIFF_BYTES);
		expect(diff.truncated).toBe(true);
		f.data.status = 'not porcelain';
		await expect(f.git.status(f.signal)).rejects.toThrow('malformed');
	} finally {
		await f.cleanup();
	}
});

test('missing Git, nonrepository and repository failure are useful typed failures', async () => {
	const f = await setup();
	try {
		f.data.code = 128;
		f.data.stderr = 'fatal: not a git repository (or any of the parent directories): .git';
		await expect(f.git.status(f.signal)).rejects.toMatchObject({ kind: 'not-repository' });
		f.data.stderr = 'fatal: permission denied';
		await expect(f.git.status(f.signal)).rejects.toThrow('permission denied');
		await expect(
			new GitWorkspaceChanges(f.workspace, () => {
				throw new Error('SECRET');
			}).status(f.signal),
		).rejects.toMatchObject({ kind: 'git-unavailable' });
	} finally {
		await f.cleanup();
	}
});

test('unrelated repository root, traversal and symlink inspection fail closed before diff', async () => {
	const f = await setup();
	const unrelated = await createTempDirectory('phase20-unrelated-');
	try {
		f.data.root = `${unrelated.directory}\n`;
		await expect(f.git.status(f.signal)).rejects.toMatchObject({ kind: 'unsupported-scope' });
		f.data.root = `${f.directory}\n`;
		await expect(
			f.git.diff({ ...entry, path: '../outside' }, 'unstaged', f.signal),
		).rejects.toMatchObject({ kind: 'unsupported-scope' });
		if (process.platform !== 'win32') {
			await writeFile(join(unrelated.directory, 'secret'), 'outside');
			await symlink(unrelated.directory, join(f.directory, 'link'));
			await expect(
				f.git.diff({ ...entry, path: 'link/secret' }, 'unstaged', f.signal),
			).rejects.toThrow('symlinks');
		}
		expect(f.calls.some((call) => call.cmd.includes('diff'))).toBe(false);
	} finally {
		await f.cleanup();
		await unrelated.cleanup();
	}
});
