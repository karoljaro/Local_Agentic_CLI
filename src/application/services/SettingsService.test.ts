import { expect, test } from 'bun:test';
import { InMemorySettingsStore } from '@/test-support/InMemorySettingsStore';
import { createDeferred } from '@/test-support/createDeferred';
import { SETTINGS_DEFAULTS, resolveSettingsValues } from '@/domain/UserSettings';
import { SettingsService } from './SettingsService';

test('persistence precedes runtime application and a failed save keeps the old effective value', async () => {
	const store = new InMemorySettingsStore();
	const write = createDeferred<void>();
	store.update = async () => {
		await write.promise;
		throw new Error('permission denied');
	};
	const settings = new SettingsService(store);
	const change = settings.set('maxOutputTokens', 2048);
	expect(settings.getSnapshot().effective.maxOutputTokens).toBe(4096);
	write.resolve();
	await expect(change).rejects.toThrow('permission denied');
	expect(settings.getSnapshot().saved.maxOutputTokens).toBe(4096);
});
test('concurrent targeted changes serialize and preserve every other preference', async () => {
	const store = new InMemorySettingsStore();
	const settings = new SettingsService(store);
	await Promise.all([
		settings.set('maxOutputTokens', 2048),
		settings.set('contextWindowTokens', 8192),
		settings.set('keepAlive', '5m'),
		settings.writeLastSelectedModel('chosen'),
	]);
	expect(store.document?.preferences).toEqual({
		...SETTINGS_DEFAULTS,
		maxOutputTokens: 2048,
		contextWindowTokens: 8192,
		keepAlive: '5m',
		lastSelectedModel: 'chosen',
	});
	expect(settings.getSnapshot().saved).toEqual(resolveSettingsValues(store.document));
});
test('endpoint save/reset accurately separates next-start and active provider configuration', async () => {
	const settings = new SettingsService(new InMemorySettingsStore());
	await settings.set('ollamaBaseUrl', 'https://server.example/ollama');
	expect(settings.getSnapshot()).toMatchObject({
		saved: { ollamaBaseUrl: 'https://server.example/ollama' },
		effective: { ollamaBaseUrl: SETTINGS_DEFAULTS.ollamaBaseUrl },
	});
	await settings.reset('ollamaBaseUrl');
	expect(settings.getSnapshot().saved.ollamaBaseUrl).toBe(SETTINGS_DEFAULTS.ollamaBaseUrl);
});
test('model preference and Settings share one write path; reset keeps unrelated inference/retention state', async () => {
	const settings = new SettingsService(new InMemorySettingsStore());
	await settings.set('maxOutputTokens', 2048);
	await settings.writeLastSelectedModel('installed');
	expect(await settings.readLastSelectedModel()).toBe('installed');
	await settings.reset('lastSelectedModel');
	expect(await settings.readLastSelectedModel()).toBeUndefined();
	expect(settings.getSnapshot().saved.maxOutputTokens).toBe(2048);
	await settings.reset('maxOutputTokens');
	expect(settings.getSnapshot().saved).toEqual(SETTINGS_DEFAULTS);
});
test('validation uses the latest serialized budget, including fixed operational instruction/tool costs', async () => {
	const store = new InMemorySettingsStore();
	const settings = new SettingsService(store, { minimumInputTokens: 8000 });
	await expect(settings.set('maxOutputTokens', 10000)).rejects.toThrow('input tokens');
	expect(store.document).toBeUndefined();
	await expect(settings.set('contextWindowTokens', 8192)).rejects.toThrow('input tokens');
	expect(settings.getSnapshot().effective).toEqual(SETTINGS_DEFAULTS);
});
test('already-cancelled update and shutdown do not publish queued settings', async () => {
	const store = new InMemorySettingsStore();
	const settings = new SettingsService(store);
	const request = new AbortController();
	request.abort();
	await expect(settings.set('keepAlive', '5m', request.signal)).rejects.toMatchObject({
		name: 'AbortError',
	});
	const pending = settings.set('maxOutputTokens', 2048);
	settings.dispose();
	await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
	await settings.whenIdle();
	expect(store.document).toBeUndefined();
});
test('invalid configuration produces a read-only service and never authorizes destructive reset', async () => {
	const store = new InMemorySettingsStore();
	const settings = new SettingsService(store, { problem: 'Malformed settings JSON' });
	await expect(settings.reset('ollamaBaseUrl')).rejects.toThrow('Repair the file');
	expect(store.document).toBeUndefined();
});
