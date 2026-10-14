import { afterEach, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDeferred } from '@/test-support/createDeferred';
import {
	SETTINGS_DEFAULTS,
	SETTINGS_MAX_BYTES,
	type SettingsDocument,
} from '@/domain/UserSettings';
import { JsonSettingsStore, settingsFilePath } from './JsonSettingsStore';

const directories: string[] = [];
afterEach(async () => {
	for (const directory of directories.splice(0))
		await fs.rm(directory, { recursive: true, force: true });
});
const setup = async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), 'codesh-settings-'));
	directories.push(directory);
	const path = join(directory, 'settings.json');
	return { directory, path, store: new JsonSettingsStore(path) };
};
const defaults = (): SettingsDocument => ({ version: 1, preferences: { ...SETTINGS_DEFAULTS } });

test('uses platform config conventions and ignores relative XDG/appdata roots', () => {
	expect(settingsFilePath({}, 'linux', '/home/example')).toBe(
		'/home/example/.config/codesh/settings.json',
	);
	expect(settingsFilePath({ XDG_CONFIG_HOME: '/tmp/xdg' }, 'linux', '/home/example')).toBe(
		'/tmp/xdg/codesh/settings.json',
	);
	expect(settingsFilePath({ XDG_CONFIG_HOME: 'relative' }, 'linux', '/home/example')).toContain(
		'/.config/codesh/',
	);
	expect(settingsFilePath({}, 'darwin', '/Users/example')).toBe(
		'/Users/example/Library/Application Support/codesh/settings.json',
	);
	expect(
		settingsFilePath(
			{ APPDATA: 'C:\\Users\\example\\AppData\\Roaming' },
			'win32',
			'C:\\Users\\example',
		),
	).toBe('C:\\Users\\example\\AppData\\Roaming\\codesh\\settings.json');
});
test('first run, readable atomic save, file permissions and fresh reload', async () => {
	const { path, directory, store } = await setup();
	expect(await store.read()).toBeUndefined();
	await store.update(defaults);
	expect(await new JsonSettingsStore(path).read()).toEqual(defaults());
	expect(await fs.readFile(path, 'utf8')).toContain('\n  "preferences": {');
	if (process.platform !== 'win32') expect((await fs.stat(path)).mode & 0o777).toBe(0o600);
	expect(await fs.readdir(directory)).toEqual(['settings.json']);
});
for (const content of [
	'{ broken original bytes',
	'{"version":2,"preferences":{}}',
	'{"version":1,"preferences":{"unknown":"preserve"}}',
	'{"version":1,"preferences":{"maxOutputTokens":0}}',
	'{"version":1,"preferences":{},"future":true}',
	'x'.repeat(SETTINGS_MAX_BYTES + 1),
]) {
	test(`invalid/future/oversize configuration is never overwritten (${content.length} bytes)`, async () => {
		const { path, store, directory } = await setup();
		await fs.writeFile(path, content);
		await expect(store.read()).rejects.toThrow();
		await expect(store.update(defaults)).rejects.toThrow();
		expect(await fs.readFile(path, 'utf8')).toBe(content);
		expect(await fs.readdir(directory)).toEqual(['settings.json']);
	});
}
test('atomic rename failure preserves the complete old document and removes temporary/lock files', async () => {
	const { path, store, directory } = await setup();
	await store.update(defaults);
	const original = await fs.readFile(path);
	const broken = new JsonSettingsStore(path, {
		...fs,
		rename: async () => {
			throw new Error('rename failed');
		},
	});
	await expect(
		broken.update(() => ({
			...defaults(),
			preferences: { ...SETTINGS_DEFAULTS, keepAlive: '5m' },
		})),
	).rejects.toThrow('rename failed');
	expect(await fs.readFile(path)).toEqual(original);
	expect(await fs.readdir(directory)).toEqual(['settings.json']);
});
test('permission failures are explicit and preserve existing bytes', async () => {
	const { path, store, directory } = await setup();
	await store.update(defaults);
	const original = await fs.readFile(path);
	const denied = new JsonSettingsStore(path, {
		...fs,
		open: async () => {
			throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
		},
	});
	await expect(denied.read()).rejects.toThrow('permission denied');
	await expect(denied.update(defaults)).rejects.toThrow('permission denied');
	expect(await fs.readFile(path)).toEqual(original);
	expect(await fs.readdir(directory)).toEqual(['settings.json']);
});
test('conflicting writes on one store serialize read/modify/replace without lost fields', async () => {
	const { store } = await setup();
	await Promise.all([
		store.update(defaults),
		store.update((current) => ({
			...current!,
			preferences: { ...current!.preferences, keepAlive: '5m' },
		})),
		store.update((current) => ({
			...current!,
			preferences: { ...current!.preferences, lastSelectedModel: 'selected' },
		})),
	]);
	expect((await store.read())?.preferences).toEqual({
		...SETTINGS_DEFAULTS,
		keepAlive: '5m',
		lastSelectedModel: 'selected',
	});
});
test('another process/store cannot overwrite a held transaction; retry preserves both changes', async () => {
	const { path } = await setup();
	const entered = createDeferred<void>();
	const release = createDeferred<void>();
	const first = new JsonSettingsStore(path, {
		...fs,
		rename: async (...args) => {
			entered.resolve();
			await release.promise;
			await fs.rename(...args);
		},
	});
	const second = new JsonSettingsStore(path);
	const pending = first.update(() => ({
		version: 1,
		preferences: { ...SETTINGS_DEFAULTS, keepAlive: '5m' },
	}));
	await entered.promise;
	await expect(second.update(defaults)).rejects.toThrow('another Codesh process');
	release.resolve();
	await pending;
	await second.update((current) => ({
		...current!,
		preferences: { ...current!.preferences, maxOutputTokens: 2048 },
	}));
	expect((await second.read())?.preferences).toMatchObject({
		keepAlive: '5m',
		maxOutputTokens: 2048,
	});
});
test('cancellation before replacement cleans up and leaves the original untouched', async () => {
	const { path, store, directory } = await setup();
	await store.update(defaults);
	const original = await fs.readFile(path);
	const request = new AbortController();
	const cancelled = new JsonSettingsStore(path, {
		...fs,
		open: async (...args) => {
			const handle = await fs.open(...args);
			if (String(args[0]).endsWith('.tmp')) request.abort();
			return handle;
		},
	});
	await expect(cancelled.update(defaults, request.signal)).rejects.toMatchObject({
		name: 'AbortError',
	});
	expect(await fs.readFile(path)).toEqual(original);
	expect(await fs.readdir(directory)).toEqual(['settings.json']);
});
test('cancellation after atomic replacement does not misreport a committed document', async () => {
	const { path } = await setup();
	const request = new AbortController();
	const store = new JsonSettingsStore(path, {
		...fs,
		rename: async (...args) => {
			await fs.rename(...args);
			request.abort();
		},
	});
	expect(await store.update(defaults, request.signal)).toEqual(defaults());
	expect(await store.read()).toEqual(defaults());
});
test('manual concurrent edits are detected before replacement and their bytes survive', async () => {
	const { path, store } = await setup();
	await store.update(defaults);
	const edited = JSON.stringify({
		version: 1,
		preferences: { ...SETTINGS_DEFAULTS, keepAlive: '30m' },
	});
	const updating = new JsonSettingsStore(path, {
		...fs,
		open: async (...args) => {
			const handle = await fs.open(...args);
			if (String(args[0]).endsWith('.tmp')) await fs.writeFile(path, edited);
			return handle;
		},
	});
	await expect(updating.update(defaults)).rejects.toThrow('changed outside Codesh');
	expect(await fs.readFile(path, 'utf8')).toBe(edited);
});
test('symlink settings targets are rejected without touching either path', async () => {
	if (process.platform === 'win32') return;
	const { path, directory, store } = await setup();
	const target = join(directory, 'original.json');
	await fs.writeFile(target, JSON.stringify(defaults()));
	await fs.symlink(target, path);
	await expect(store.read()).rejects.toThrow('regular file');
	await expect(store.update(defaults)).rejects.toThrow('regular file');
	expect(await fs.readFile(target, 'utf8')).toBe(JSON.stringify(defaults()));
	expect((await fs.lstat(path)).isSymbolicLink()).toBe(true);
});
