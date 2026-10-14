import { expect, test } from 'bun:test';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { GitWorkspaceChanges } from './GitWorkspaceChanges';
import { GIT_DIFF_BYTES } from './limits';

const integration = Bun.which('git') === null ? test.skip : test;
const runGit = async (cwd: string, args: string[]): Promise<string> => {
	const child = Bun.spawn({
		cmd: ['git', '--no-pager', '--literal-pathspecs', ...args],
		cwd,
		env: {
			...Object.fromEntries(
				Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')),
			),
			GIT_TERMINAL_PROMPT: '0',
		},
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 5_000,
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code !== 0) throw new Error(`Fixture Git ${args[0]} failed: ${stderr}`);
	return stdout;
};
const commit = (cwd: string) =>
	runGit(cwd, [
		'-c',
		'user.name=Phase 20 fixture',
		'-c',
		'user.email=phase20@example.invalid',
		'-c',
		'commit.gpgSign=false',
		'commit',
		'-qm',
		'fixture baseline',
	]);

integration(
	'disposable real repository: clean, staged/unstaged/untracked, deletion, rename, literal unusual names and bounded diff',
	async () => {
		const temp = await createTempDirectory('phase20-real-git-');
		try {
			const root = join(
				temp.directory,
				process.platform === 'win32' ? 'repo space' : 'repo space\nline',
			);
			await mkdir(root);
			await runGit(root, ['init', '-q']);
			const unusual = process.platform === 'win32' ? '--space-世界.txt' : '--space\tline\n世界.txt';
			for (const path of ['both.txt', 'deleted.txt', 'old name.txt', unusual, 'binary.bin'])
				await writeFile(
					join(root, path),
					path === 'binary.bin' ? new Uint8Array([0, 1, 2]) : 'baseline\n',
				);
			await runGit(root, ['add', '--', '.']);
			await commit(root);
			const git = new GitWorkspaceChanges(root);
			const signal = new AbortController().signal;
			expect(await git.status(signal)).toEqual({ entries: [], truncated: false });
			await writeFile(join(root, 'both.txt'), 'staged content\n');
			await writeFile(join(root, 'added.txt'), 'added content\n');
			await rename(join(root, 'old name.txt'), join(root, 'new name.txt'));
			await runGit(root, ['add', '--', 'both.txt', 'added.txt', 'old name.txt', 'new name.txt']);
			await writeFile(join(root, 'both.txt'), 'working content\n');
			await writeFile(join(root, unusual), 'literal path content\n');
			await writeFile(join(root, 'binary.bin'), new Uint8Array([0, 3, 4]));
			await rm(join(root, 'deleted.txt'));
			await writeFile(join(root, 'untracked.txt'), 'not a diff\n');
			const indexBefore = await readFile(join(root, '.git', 'index'));
			const status = await git.status(signal);
			const find = (path: string) => status.entries.find((entry) => entry.path === path)!;
			expect(find('both.txt')).toMatchObject({ staged: 'M', unstaged: 'M' });
			expect(find('added.txt')).toMatchObject({ staged: 'A', unstaged: null });
			expect(find('deleted.txt')).toMatchObject({ staged: null, unstaged: 'D' });
			expect(find('new name.txt')).toMatchObject({ staged: 'R', originalPath: 'old name.txt' });
			expect(find('untracked.txt').untracked).toBe(true);
			expect(find(unusual).unstaged).toBe('M');
			expect((await git.diff(find('both.txt'), 'staged', signal)).text).toContain(
				'+staged content',
			);
			expect((await git.diff(find('both.txt'), 'unstaged', signal)).text).toContain(
				'+working content',
			);
			expect((await git.diff(find('new name.txt'), 'staged', signal)).text).toContain(
				'rename from old name.txt',
			);
			expect((await git.diff(find(unusual), 'unstaged', signal)).text).toContain(
				'+literal path content',
			);
			expect((await git.diff(find('deleted.txt'), 'unstaged', signal)).text).toContain(
				'deleted file mode',
			);
			expect((await git.diff(find('binary.bin'), 'unstaged', signal)).notice).toContain(
				'binary difference',
			);
			expect((await git.diff(find('untracked.txt'), 'unstaged', signal)).text).toBe('');
			expect(await readFile(join(root, '.git', 'index'))).toEqual(indexBefore);
			await writeFile(
				join(root, 'both.txt'),
				Array.from({ length: 20_000 }, (_, index) => `large line ${index}`).join('\n'),
			);
			const large = await git.diff(find('both.txt'), 'unstaged', signal);
			expect(large.truncated).toBe(true);
			expect(Buffer.byteLength(large.text)).toBeLessThanOrEqual(GIT_DIFF_BYTES);
			await writeFile(join(root, 'both.txt'), 'staged content\n');
			expect((await git.diff(find('both.txt'), 'unstaged', signal)).notice).toContain('stale');
		} finally {
			await temp.cleanup();
		}
	},
	20_000,
);

integration(
	'nested workspace and Git worktree use their actual scope without displaying parent changes',
	async () => {
		const temp = await createTempDirectory('phase20-scope-git-');
		try {
			await mkdir(join(temp.directory, 'app'));
			await runGit(temp.directory, ['init', '-q']);
			await writeFile(join(temp.directory, 'parent.txt'), 'parent baseline\n');
			await writeFile(join(temp.directory, 'app', 'file.txt'), 'app baseline\n');
			await runGit(temp.directory, ['add', '--', '.']);
			await commit(temp.directory);
			await writeFile(join(temp.directory, 'parent.txt'), 'parent secret content\n');
			const nested = new GitWorkspaceChanges(join(temp.directory, 'app'));
			const signal = new AbortController().signal;
			expect((await nested.status(signal)).entries).toEqual([]);
			await writeFile(join(temp.directory, 'app', 'file.txt'), 'app changed\n');
			const status = await nested.status(signal);
			expect(status.entries.map((entry) => entry.path)).toEqual(['file.txt']);
			const diff = await nested.diff(status.entries[0]!, 'unstaged', signal);
			expect(diff.text).toContain('+app changed');
			expect(diff.text).not.toContain('parent secret');
			const worktree = join(temp.directory, 'worktree');
			await runGit(temp.directory, ['worktree', 'add', '--detach', worktree]);
			expect((await readFile(join(worktree, '.git'), 'utf8')).startsWith('gitdir:')).toBe(true);
			await writeFile(join(worktree, 'app', 'file.txt'), 'worktree changed\n');
			const linked = new GitWorkspaceChanges(join(worktree, 'app'));
			const linkedStatus = await linked.status(signal);
			expect(linkedStatus.entries.map((entry) => entry.path)).toEqual(['file.txt']);
			expect((await linked.diff(linkedStatus.entries[0]!, 'unstaged', signal)).text).toContain(
				'+worktree changed',
			);
		} finally {
			await temp.cleanup();
		}
	},
	20_000,
);

integration(
	'repository-defined fsmonitor, clean/process filters, external diff and textconv never run; index remains unchanged',
	async () => {
		const temp = await createTempDirectory('phase20-helper-git-');
		try {
			await runGit(temp.directory, ['init', '-q']);
			await writeFile(join(temp.directory, 'file.txt'), 'baseline\n');
			await runGit(temp.directory, ['add', '--', '.']);
			await commit(temp.directory);
			const marker = join(temp.directory, 'helper-executed');
			const helper = join(temp.directory, 'helper.ts');
			await writeFile(
				helper,
				`await Bun.write(${JSON.stringify(marker)}, 'executed');\nconsole.log('helper content');\n`,
			);
			const command = `bun "${helper}"`;
			for (const key of [
				'core.fsmonitor',
				'filter.danger.clean',
				'filter.danger.smudge',
				'filter.danger.process',
				'diff.external',
				'diff.danger.command',
				'diff.danger.textconv',
			])
				await runGit(temp.directory, ['config', key, command]);
			await runGit(temp.directory, ['config', 'filter.danger.required', 'true']);
			await writeFile(join(temp.directory, '.gitattributes'), '*.txt filter=danger diff=danger\n');
			await writeFile(join(temp.directory, 'file.txt'), 'safe changed content\n');
			const before = await readFile(join(temp.directory, '.git', 'index'));
			const git = new GitWorkspaceChanges(temp.directory);
			const signal = new AbortController().signal;
			await expect(git.status(signal)).rejects.toThrow('Git content filters are configured');
			// After removing content filters, fsmonitor/external diff/textconv remain configured.
			await runGit(temp.directory, ['config', '--remove-section', 'filter.danger']);
			const status = await git.status(signal);
			const selected = status.entries.find((entry) => entry.path === 'file.txt')!;
			expect((await git.diff(selected, 'unstaged', signal)).text).toContain(
				'+safe changed content',
			);
			expect(await Bun.file(marker).exists()).toBe(false);
			expect(await readFile(join(temp.directory, '.git', 'index'))).toEqual(before);
		} finally {
			await temp.cleanup();
		}
	},
	20_000,
);

integration(
	'a real nonrepository has explicit feedback instead of automatic initialization',
	async () => {
		const temp = await createTempDirectory('phase20-no-git-');
		try {
			await expect(
				new GitWorkspaceChanges(temp.directory).status(new AbortController().signal),
			).rejects.toMatchObject({ kind: 'not-repository' });
			expect(await Bun.file(join(temp.directory, '.git', 'HEAD')).exists()).toBe(false);
		} finally {
			await temp.cleanup();
		}
	},
);
