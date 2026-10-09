import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JsonSessionMemoryStore } from './JsonSessionMemoryStore';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { asSessionId } from '@/domain/Ids';
import {
	emptySessionMemory,
	MEMORY_MAX_BYTES,
	MEMORY_UPDATER_VERSION,
	type SessionMemoryDocument,
} from '@/domain/SessionMemory';
const sessionId = asSessionId('memory-store-session');
const document = (): SessionMemoryDocument => ({
	version: 1,
	sessionId,
	source: { eventCount: 0, lastEventId: null, digest: '0'.repeat(64) },
	updater: { version: MEMORY_UPDATER_VERSION, model: null, status: 'unavailable' },
	memory: emptySessionMemory(),
});
const workspace = async (
	run: (directory: string, store: JsonSessionMemoryStore) => Promise<void>,
) => {
	const { directory, cleanup } = await createTempDirectory('phase18-store-');
	try {
		await run(directory, new JsonSessionMemoryStore(directory));
	} finally {
		await cleanup();
	}
};
describe('atomic bounded session memory artifact', () => {
	test('missing read returns unavailable and creates no directory/file', async () =>
		workspace(async (directory, store) => {
			expect(await store.read(sessionId)).toBeUndefined();
			expect(await readdir(directory)).toEqual([]);
		}));
	test('readable JSON round-trip, newline, restrictive permissions and atomic replacement', async () =>
		workspace(async (directory, store) => {
			const value = document();
			await store.write(value);
			const path = join(directory, `${sessionId}.json`);
			expect(await store.read(sessionId)).toEqual(value);
			expect((await readFile(path, 'utf8')).endsWith('\n')).toBe(true);
			if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
			value.updater.status = 'failed';
			await store.write(value);
			expect((await store.read(sessionId))?.updater.status).toBe('failed');
			expect(await readdir(directory)).toEqual([`${sessionId}.json`]);
		}));
	for (const [name, content] of [
		['malformed', '{'],
		['version', JSON.stringify({ ...document(), version: 99 })],
		['unknown-field', JSON.stringify({ ...document(), transcript: [] })],
		['foreign-session', JSON.stringify({ ...document(), sessionId: 'other' })],
		['oversized', 'x'.repeat(MEMORY_MAX_BYTES + 1)],
	])
		test(`rejects ${name} file`, async () =>
			workspace(async (directory, store) => {
				await writeFile(join(directory, `${sessionId}.json`), content!);
				await expect(store.read(sessionId)).rejects.toThrow();
			}));
	test('invalid writes preserve the previous complete artifact', async () =>
		workspace(async (directory, store) => {
			await store.write(document());
			const path = join(directory, `${sessionId}.json`);
			const before = await readFile(path);
			await expect(store.write({ ...document(), version: 99 } as never)).rejects.toThrow();
			expect(await readFile(path)).toEqual(before);
		}));
	test('rename failure cleans owned temporary file and preserves destination', async () =>
		workspace(async (directory, store) => {
			await mkdir(join(directory, `${sessionId}.json`));
			await expect(store.write(document())).rejects.toThrow();
			expect(await readdir(directory)).toEqual([`${sessionId}.json`]);
			expect((await stat(join(directory, `${sessionId}.json`))).isDirectory()).toBe(true);
		}));
	test('cancelled read/write never replaces existing state', async () =>
		workspace(async (directory, store) => {
			await store.write(document());
			const path = join(directory, `${sessionId}.json`);
			const before = await readFile(path);
			const signal = AbortSignal.abort();
			await expect(store.write(document(), signal)).rejects.toThrow();
			await expect(store.read(sessionId, signal)).rejects.toThrow();
			expect(await readFile(path)).toEqual(before);
		}));
	for (const unsafe of ['../other', 'a/b', '/root', '', 'a\\b'])
		test(`rejects unsafe session ID ${JSON.stringify(unsafe)}`, async () =>
			workspace(async (_directory, store) => {
				await expect(store.read(asSessionId(unsafe))).rejects.toThrow();
				await expect(store.write({ ...document(), sessionId: unsafe })).rejects.toThrow();
			}));
	test('ignored abandoned temporary file cannot substitute for missing memory', async () =>
		workspace(async (directory, store) => {
			await writeFile(
				join(directory, `${sessionId}.json.abandoned.tmp`),
				JSON.stringify(document()),
			);
			expect(await store.read(sessionId)).toBeUndefined();
		}));
});
