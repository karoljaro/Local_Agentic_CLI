import { expect, test } from 'bun:test';
import { TextRenderable } from '@opentui/core';
import { createTestRenderer, MockTreeSitterClient } from '@opentui/core/testing';
import {
	WorkspaceGitError,
	type WorkspaceChange,
	type WorkspaceDiff,
	type WorkspaceStatus,
} from '@/application/ports/WorkspaceChangesPort';
import { createDeferred } from '@/test-support/createDeferred';
import { FakeTerminalRuntime } from '@/test-support/FakeTerminalRuntime';
import { asToolCallId } from '@/domain/Ids';
import { TerminalApp } from './TerminalApp';
import { WorkspaceChangesView } from './WorkspaceChangesView';

const change = (path: string, staged = true, unstaged = true): WorkspaceChange => ({
	path,
	staged: staged ? 'M' : null,
	unstaged: unstaged ? 'M' : null,
	untracked: false,
});
const status = (entries: WorkspaceChange[]): WorkspaceStatus => ({ entries, truncated: false });

const setup = async (runtime = new FakeTerminalRuntime()) => {
	const native = await createTestRenderer({
		width: 80,
		height: 24,
		screenMode: 'alternate-screen',
		exitOnCtrlC: false,
		exitSignals: [],
		autoFocus: false,
		useThread: false,
		kittyKeyboard: true,
	});
	const parser = new MockTreeSitterClient();
	const app = new TerminalApp(native.renderer, runtime, 'new', parser);
	await app.ready;
	const settle = async () => {
		for (let pass = 0; pass < 8; pass++) {
			await Promise.resolve();
			parser.resolveAllHighlightOnce?.();
			await native.renderOnce();
		}
	};
	const open = async () => {
		await native.mockInput.typeText('/changes');
		native.mockInput.pressEnter();
		await settle();
	};
	const view = () => (app as unknown as { picker: WorkspaceChangesView }).picker;
	return {
		...native,
		app,
		runtime,
		parser,
		settle,
		open,
		view,
		close: async () => {
			await app.shutdown();
			await parser.destroy();
		},
	};
};

test('slash entry opens native status, navigates and inspects both diffs, refreshes, then returns to unchanged chat', async () => {
	const runtime = new FakeTerminalRuntime();
	let entries = [
		change('both.ts'),
		{ ...change('added.ts', true, false), staged: 'A' as const },
		{ ...change('new.txt', false, false), untracked: true },
	];
	const diffs: { path: string; kind: string }[] = [];
	let reads = 0;
	runtime.workspaceChanges = {
		status: async () => {
			reads++;
			return status(entries);
		},
		diff: async (entry, kind) => {
			diffs.push({ path: entry.path, kind });
			return {
				text: `diff --git a/${entry.path} b/${entry.path}\n@@ -1 +1 @@\n-old\n+${kind}\n context\n`,
				truncated: false,
			};
		},
	};
	const ui = await setup(runtime);
	try {
		const session = ui.app.conversation.sessionId;
		runtime.complete(session, 'Conversation stays here.');
		await ui.open();
		expect(ui.captureCharFrame()).toContain('Workspace Changes');
		expect(ui.captureCharFrame()).toContain('MM  both.ts');
		expect(ui.captureCharFrame()).toContain('A·  added.ts');
		expect(ui.captureCharFrame()).toContain('??  new.txt');
		expect(reads).toBe(1);
		expect(diffs).toHaveLength(0);
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('Unstaged diff');
		expect(ui.captureCharFrame()).toContain('@@ -1 +1 @@');
		expect(ui.captureCharFrame()).toContain('-old');
		expect(ui.captureCharFrame()).toContain('+unstaged');
		ui.mockInput.pressTab();
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('Staged diff');
		expect(diffs).toEqual([
			{ path: 'both.ts', kind: 'unstaged' },
			{ path: 'both.ts', kind: 'staged' },
		]);
		ui.mockInput.pressEscape();
		await ui.settle();
		ui.mockInput.pressArrow('down');
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('Staged diff');
		expect(ui.captureCharFrame()).toContain('added.ts');
		ui.mockInput.pressEscape();
		ui.mockInput.pressArrow('down');
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('Untracked file');
		expect(ui.captureCharFrame()).toContain('no Git diff yet');
		expect(diffs).toHaveLength(3);
		entries = [];
		ui.mockInput.pressKey('r');
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('No changes detected in this workspace scope.');
		expect(reads).toBe(2);
		ui.mockInput.pressEscape();
		await ui.settle();
		expect(ui.app.composer.focused).toBe(true);
		expect(ui.captureCharFrame()).toContain('Conversation stays here.');
		expect(ui.app.conversation.sessionId).toBe(session);
		expect(runtime.turns).toHaveLength(0);
	} finally {
		await ui.close();
	}
});

test('narrow terminals, escaped filenames, viewport list navigation and vertically scrolling bounded diff', async () => {
	const runtime = new FakeTerminalRuntime();
	const entries = Array.from({ length: 100 }, (_, index) =>
		change(index === 99 ? 'last\t\n\u001b[31m-世界.ts' : `long/nested/workspace/file-${index}.ts`),
	);
	runtime.workspaceChanges = {
		status: async () => ({ entries, truncated: true }),
		diff: async () => ({
			text: Array.from(
				{ length: 2_100 },
				(_, index) => `+line ${index} very long content for a narrow terminal`,
			).join('\n'),
			truncated: false,
		}),
	};
	const ui = await setup(runtime);
	try {
		ui.resize(32, 12);
		await ui.open();
		expect(ui.captureCharFrame()).toContain('Workspace Changes');
		ui.mockInput.pressKey('END');
		await ui.settle();
		expect(ui.view().state.selected?.path).toBe(entries[99]!.path);
		expect(ui.view().input.getSelectedIndex()).toBe(99);
		expect(ui.captureCharFrame()).toContain('last\\t\\n\\u001b');
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('truncated');
		expect(ui.view().diffScroll.scrollHeight).toBeGreaterThan(ui.view().diffScroll.viewport.height);
		ui.mockInput.pressKey('\u001b[6~');
		await ui.settle();
		expect(ui.view().diffScroll.scrollTop).toBeGreaterThan(0);
		ui.mockInput.pressKey('END');
		await ui.settle();
		expect(ui.captureCharFrame()).not.toContain('line 2099');
		expect(ui.captureCharFrame()).toContain('Incomplete');
		ui.resize(26, 10);
		await ui.settle();
		expect(ui.view().diffScroll.viewport.width).toBeGreaterThan(0);
		ui.mockInput.pressEscape();
		ui.mockInput.pressEscape();
		await ui.settle();
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		await ui.close();
	}
});

test.each([
	new WorkspaceGitError('git-unavailable', 'Git could not be launched.'),
	new WorkspaceGitError(
		'not-repository',
		'The workspace is not inside an accessible Git repository.',
	),
	new WorkspaceGitError('repository-error', 'Git inspection failed: fatal: bad index\u001b[31m'),
])('inspection errors keep chat functional and render safe diagnostics: %s', async (error) => {
	const runtime = new FakeTerminalRuntime();
	runtime.workspaceChanges.status = async () => {
		throw error;
	};
	const ui = await setup(runtime);
	try {
		await ui.open();
		expect(ui.captureCharFrame()).toContain(error.message.slice(0, 25));
		expect(ui.captureCharFrame()).not.toContain('\u001b');
		ui.mockInput.pressEscape();
		await ui.mockInput.typeText('Hello');
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(runtime.turns).toHaveLength(1);
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		await ui.close();
	}
});

test('loading/refresh remains cancellable; closing and shutdown suppress late native-node updates and await settlement', async () => {
	const runtime = new FakeTerminalRuntime();
	const first = createDeferred<WorkspaceStatus>();
	const second = createDeferred<WorkspaceStatus>();
	const signals: AbortSignal[] = [];
	runtime.workspaceChanges.status = (signal) => {
		signals.push(signal);
		return signals.length === 1 ? first.promise : second.promise;
	};
	const ui = await setup(runtime);
	try {
		await ui.open();
		expect(ui.captureCharFrame()).toContain('Loading workspace changes');
		ui.mockInput.pressKey('r');
		await ui.settle();
		expect(signals[0]!.aborted).toBe(true);
		second.resolve(status([change('current')]));
		await ui.settle();
		first.resolve(status([change('obsolete')]));
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('current');
		expect(ui.captureCharFrame()).not.toContain('obsolete');
		const diff = createDeferred<WorkspaceDiff>();
		let signal: AbortSignal | undefined;
		runtime.workspaceChanges.diff = (_entry, _kind, request) => {
			signal = request;
			return diff.promise;
		};
		ui.mockInput.pressEnter();
		await ui.settle();
		ui.mockInput.pressEscape();
		expect(signal?.aborted).toBe(true);
		ui.mockInput.pressEscape();
		await ui.settle();
		const shutdown = ui.app.shutdown();
		await Promise.resolve();
		expect(ui.renderer.isDestroyed).toBe(false);
		diff.resolve({ text: 'late', truncated: false });
		await shutdown;
		expect(ui.renderer.isDestroyed).toBe(true);
	} finally {
		first.resolve(status([]));
		second.resolve(status([]));
		await ui.close();
	}
});

test('binary, empty and diff failure feedback stays explicit and refresh recovers', async () => {
	const runtime = new FakeTerminalRuntime();
	let preview: WorkspaceDiff = {
		text: 'Binary files a/file and b/file differ\n',
		truncated: false,
		notice: 'Git reports a binary difference; no textual content preview is available.',
	};
	runtime.workspaceChanges.status = async () => status([change('file')]);
	runtime.workspaceChanges.diff = async () => preview;
	const ui = await setup(runtime);
	try {
		await ui.open();
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('binary difference');
		ui.mockInput.pressEscape();
		preview = {
			text: '',
			truncated: false,
			notice: 'No textual diff is available. Refresh to check the snapshot.',
		};
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('No textual diff');
		ui.mockInput.pressEscape();
		runtime.workspaceChanges.diff = async () => {
			throw new Error('Path unavailable; refresh.');
		};
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('Path unavailable');
		ui.mockInput.pressKey('r');
		await ui.settle();
		expect(ui.view().state.error).toBeNull();
	} finally {
		await ui.close();
	}
});

test('slash command cannot interfere with approval, active streaming or existing picker navigation', async () => {
	const runtime = new FakeTerminalRuntime();
	let reads = 0;
	runtime.workspaceChanges.status = async () => {
		reads++;
		return status([]);
	};
	const release = createDeferred<void>();
	runtime.script = async function* () {
		yield { contentDelta: 'Still working.' };
		await release.promise;
	};
	const ui = await setup(runtime);
	try {
		await ui.mockInput.typeText('Start');
		ui.mockInput.pressEnter();
		await ui.settle();
		await ui.mockInput.typeText('/changes');
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(reads).toBe(0);
		ui.mockInput.pressKey('F2');
		await ui.settle();
		expect(ui.captureCharFrame()).not.toContain('Workspace Changes');
		ui.mockInput.pressEscape();
		release.resolve();
		await ui.settle();
		ui.app.composer.clear();
		const approval = runtime.approval(
			{
				sessionId: ui.app.conversation.sessionId,
				toolCallId: asToolCallId('guard'),
				toolName: 'edit_file',
				toolInput: { path: 'file' },
			},
			{},
		);
		await ui.mockInput.typeText('/changes');
		ui.mockInput.pressEnter();
		await ui.settle();
		expect(reads).toBe(0);
		ui.mockInput.pressEscape();
		await approval;
		ui.mockInput.pressKey('F3');
		await ui.settle();
		expect(ui.captureCharFrame()).toContain('Resume a session');
		ui.mockInput.pressEscape();
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		release.resolve();
		await ui.close();
	}
});

test('selected file label survives refresh reordering and native diff preserves all unified line classes', async () => {
	const runtime = new FakeTerminalRuntime();
	let entries = [change('first'), change('second')];
	runtime.workspaceChanges.status = async () => status(entries);
	runtime.workspaceChanges.diff = async () => ({
		text: 'diff --git a/second b/second\n--- a/second\n+++ b/second\n@@ -1 +1 @@\n-old\n+new\n context',
		truncated: false,
	});
	const ui = await setup(runtime);
	try {
		await ui.open();
		ui.mockInput.pressArrow('down');
		entries = [change('second'), change('first')];
		ui.mockInput.pressKey('r');
		await ui.settle();
		expect(ui.view().state.selected?.path).toBe('second');
		expect(ui.view().input.getSelectedIndex()).toBe(0);
		ui.mockInput.pressEnter();
		await ui.settle();
		const text = ui.view().root.findDescendantById('diff-text') as TextRenderable;
		for (const line of [
			'diff --git',
			'--- a/second',
			'+++ b/second',
			'@@ -1 +1 @@',
			'-old',
			'+new',
			' context',
		])
			expect(text.plainText).toContain(line);
	} finally {
		await ui.close();
	}
});
