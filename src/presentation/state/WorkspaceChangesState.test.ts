import { expect, test } from 'bun:test';
import type {
	WorkspaceChange,
	WorkspaceChangesPort,
	WorkspaceDiff,
	WorkspaceStatus,
} from '@/application/ports/WorkspaceChangesPort';
import { createDeferred } from '@/test-support/createDeferred';
import { WorkspaceChangesState } from './WorkspaceChangesState';

const change = (path: string, staged = true, unstaged = true): WorkspaceChange => ({
	path,
	staged: staged ? 'M' : null,
	unstaged: unstaged ? 'M' : null,
	untracked: false,
});
const snapshot = (entries: WorkspaceChange[]): WorkspaceStatus => ({ entries, truncated: false });
const setup = () => {
	const statuses: {
		signal: AbortSignal;
		response: ReturnType<typeof createDeferred<WorkspaceStatus | Error>>;
	}[] = [];
	const diffs: {
		entry: WorkspaceChange;
		kind: string;
		signal: AbortSignal;
		response: ReturnType<typeof createDeferred<WorkspaceDiff>>;
	}[] = [];
	let updates = 0;
	const git: WorkspaceChangesPort = {
		status: (signal) => {
			const response = createDeferred<WorkspaceStatus | Error>();
			statuses.push({ signal, response });
			return response.promise.then((value) => {
				if (value instanceof Error) throw value;
				return value;
			});
		},
		diff: (entry, kind, signal) => {
			const response = createDeferred<WorkspaceDiff>();
			diffs.push({ entry, kind, signal, response });
			return response.promise;
		},
	};
	const state = new WorkspaceChangesState(git, () => updates++);
	return { state, statuses, diffs, updates: () => updates };
};

test('refresh is explicit, loading stays responsive, obsolete status cannot replace a newer snapshot', async () => {
	const f = setup();
	expect(f.statuses).toHaveLength(0);
	const old = f.state.refresh();
	expect(f.state.loadingStatus).toBe(true);
	const current = f.state.refresh();
	expect(f.statuses[0]!.signal.aborted).toBe(true);
	f.statuses[1]!.response.resolve(snapshot([change('current')]));
	await current;
	f.statuses[0]!.response.resolve(snapshot([change('obsolete')]));
	await old;
	expect(f.state.selected?.path).toBe('current');
	expect(f.state.loadingStatus).toBe(false);
	expect(f.diffs).toHaveLength(0);
	f.state.close();
});

test('selection and staged/unstaged switching retain identity and fence late previews', async () => {
	const f = setup();
	const refresh = f.state.refresh();
	f.statuses[0]!.response.resolve(snapshot([change('first'), change('second', true, false)]));
	await refresh;
	const first = f.state.inspect();
	expect(f.diffs[0]!.kind).toBe('unstaged');
	const staged = f.state.switchKind();
	expect(f.state.selected?.path).toBe('first');
	expect(f.diffs[0]!.signal.aborted).toBe(true);
	expect(f.diffs[1]!.kind).toBe('staged');
	f.diffs[1]!.response.resolve({ text: 'staged', truncated: false });
	await staged;
	f.diffs[0]!.response.resolve({ text: 'old unstaged', truncated: false });
	await first;
	expect(f.state.preview?.text).toBe('staged');
	const outdated = f.state.inspect();
	f.state.select(1);
	expect(f.diffs[2]!.signal.aborted).toBe(true);
	expect(f.state.preview).toBeNull();
	const second = f.state.inspect();
	f.diffs[3]!.response.resolve({ text: 'second', truncated: false });
	await second;
	f.diffs[2]!.response.resolve({ text: 'wrong file', truncated: false });
	await outdated;
	expect(f.state.selected?.path).toBe('second');
	expect(f.state.kind).toBe('staged');
	expect(f.state.preview?.text).toBe('second');
	f.state.close();
});

test('refresh cancels diff, preserves selected path across reorder, removes stale preview and handles disappeared selection', async () => {
	const f = setup();
	let refresh = f.state.refresh();
	f.statuses[0]!.response.resolve(snapshot([change('first'), change('second')]));
	await refresh;
	f.state.select(1);
	const diff = f.state.inspect();
	refresh = f.state.refresh();
	expect(f.diffs[0]!.signal.aborted).toBe(true);
	f.statuses[1]!.response.resolve(snapshot([change('second'), change('first')]));
	await refresh;
	f.diffs[0]!.response.resolve({ text: 'obsolete', truncated: false });
	await diff;
	expect(f.state.selectedIndex).toBe(0);
	expect(f.state.selected?.path).toBe('second');
	expect(f.state.preview).toBeNull();
	refresh = f.state.refresh();
	f.statuses[2]!.response.resolve(snapshot([]));
	await refresh;
	expect(f.state.selected).toBeUndefined();
	f.state.close();
});

test('untracked, empty diff and bounded failures do not require inference', async () => {
	const f = setup();
	const refresh = f.state.refresh();
	f.statuses[0]!.response.resolve(snapshot([{ ...change('new', false, false), untracked: true }]));
	await refresh;
	await f.state.inspect();
	expect(f.state.preview?.notice).toContain('no Git diff yet');
	expect(f.diffs).toHaveLength(0);
	const failing = f.state.refresh();
	f.statuses[1]!.response.resolve(new Error('Git could not be launched.'));
	await failing;
	expect(f.state.error).toContain('Git could not be launched');
	expect(f.state.status).toBeNull();
	f.state.close();
});

test('leaving or closing cancels pending work; shutdown waits for settlement without late UI updates', async () => {
	const f = setup();
	const refresh = f.state.refresh();
	f.statuses[0]!.response.resolve(snapshot([change('file')]));
	await refresh;
	const diff = f.state.inspect();
	f.state.leaveDiff();
	expect(f.diffs[0]!.signal.aborted).toBe(true);
	f.state.close();
	const updates = f.updates();
	let idle = false;
	const drain = f.state.whenIdle().then(() => {
		idle = true;
	});
	await Promise.resolve();
	expect(idle).toBe(false);
	f.diffs[0]!.response.resolve({ text: 'late', truncated: false });
	await diff;
	await drain;
	expect(f.state.preview).toBeNull();
	expect(f.updates()).toBe(updates);
	await f.state.refresh();
	expect(f.statuses).toHaveLength(1);
});
