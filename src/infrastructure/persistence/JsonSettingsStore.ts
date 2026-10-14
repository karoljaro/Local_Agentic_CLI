import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve, win32 } from 'node:path';
import { homedir } from 'node:os';
import type { SettingsDocument } from '@/domain/UserSettings';
import {
	ModelPreferenceSchema,
	parseSettingsDocument,
	SETTINGS_MAX_BYTES,
} from '@/domain/UserSettings';
import type { SettingsStorePort } from '@/application/ports/SettingsPort';
import { throwIfAborted } from '@/application/services/cancellation';

type FileIO = Pick<typeof fs, 'open' | 'lstat' | 'mkdir' | 'rename' | 'unlink'>;
export const settingsFilePath = (
	env: Record<string, string | undefined> = process.env,
	platform = process.platform,
	home = homedir(),
): string => {
	if (platform === 'win32') {
		const base = env['APPDATA'];
		return win32.join(
			base && win32.isAbsolute(base) ? base : win32.join(home, 'AppData', 'Roaming'),
			'codesh',
			'settings.json',
		);
	}
	if (platform === 'darwin')
		return join(home, 'Library', 'Application Support', 'codesh', 'settings.json');
	const base = env['XDG_CONFIG_HOME'];
	return join(base && isAbsolute(base) ? base : join(home, '.config'), 'codesh', 'settings.json');
};

/** Bounded, validated read/modify/atomic-replace. Lock contention fails without lost updates. */
export class JsonSettingsStore implements SettingsStorePort {
	readonly path: string;
	private tail: Promise<void> = Promise.resolve();
	constructor(
		path = settingsFilePath(),
		private readonly io: FileIO = fs,
	) {
		this.path = resolve(path);
	}
	async read(signal?: AbortSignal): Promise<SettingsDocument | undefined> {
		const bytes = await this.readBytes(this.path, signal);
		if (!bytes) return undefined;
		let value: unknown;
		try {
			value = JSON.parse(bytes.toString('utf8'));
		} catch {
			throw new Error('Malformed settings JSON. Original file preserved; repair it before saving.');
		}
		return parseSettingsDocument(value);
	}
	update(
		change: (current: SettingsDocument | undefined) => SettingsDocument,
		signal?: AbortSignal,
	): Promise<SettingsDocument> {
		const work = this.tail.then(() => this.replace(change, signal));
		this.tail = work.then(
			() => undefined,
			() => undefined,
		);
		return work;
	}
	whenIdle(): Promise<void> {
		return this.tail;
	}
	private async replace(
		change: (current: SettingsDocument | undefined) => SettingsDocument,
		signal?: AbortSignal,
	): Promise<SettingsDocument> {
		throwIfAborted(signal);
		await this.io.mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
		const lockPath = `${this.path}.lock`;
		let lock;
		try {
			lock = await this.io.open(lockPath, 'wx', 0o600);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'EEXIST')
				throw new Error(
					'Settings are being saved by another Codesh process. Retry after it finishes. A lock left by a terminated process can be removed after all Codesh processes exit.',
				);
			throw error;
		}
		const temporary = `${this.path}.${randomUUID()}.tmp`;
		let handle;
		try {
			throwIfAborted(signal);
			const original = await this.readBytes(this.path, signal);
			// Parse through the same boundary even on updates; corrupt/future files are never replaced.
			const current = original ? this.parseBytes(original) : undefined;
			const document = parseSettingsDocument(change(current));
			const content = JSON.stringify(document, null, 2) + '\n';
			if (Buffer.byteLength(content) > SETTINGS_MAX_BYTES)
				throw new Error('Settings exceed the 16384-byte limit.');
			throwIfAborted(signal);
			handle = await this.io.open(temporary, 'wx', 0o600);
			await handle.writeFile(content, 'utf8');
			await handle.sync();
			await handle.close();
			handle = undefined;
			const latest = await this.readBytes(this.path, signal);
			if (fingerprint(original) !== fingerprint(latest))
				throw new Error(
					'Settings changed outside Codesh during save. Original file preserved; reopen Codesh before retrying.',
				);
			throwIfAborted(signal);
			await this.io.rename(temporary, this.path);
			return document;
		} finally {
			await handle?.close().catch(() => undefined);
			await this.io.unlink(temporary).catch(() => undefined);
			await lock.close().catch(() => undefined);
			await this.io.unlink(lockPath).catch(() => undefined);
		}
	}
	private parseBytes(bytes: Buffer): SettingsDocument {
		let value: unknown;
		try {
			value = JSON.parse(bytes.toString('utf8'));
		} catch {
			throw new Error('Malformed settings JSON. Original file preserved; repair it before saving.');
		}
		return parseSettingsDocument(value);
	}
	private async readBytes(path: string, signal?: AbortSignal): Promise<Buffer | undefined> {
		throwIfAborted(signal);
		let handle;
		try {
			const stat = await this.io.lstat(path);
			if (!stat.isFile() || stat.isSymbolicLink())
				throw new Error('Settings path must be a regular file, not a symlink.');
			handle = await this.io.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
			const { size } = await handle.stat();
			if (size > SETTINGS_MAX_BYTES)
				throw new Error('Settings exceed the 16384-byte limit. Original file preserved.');
			const bytes = Buffer.alloc(size);
			let offset = 0;
			while (offset < size) {
				throwIfAborted(signal);
				const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
				if (!bytesRead) throw new Error('Settings changed during read. Original file preserved.');
				offset += bytesRead;
			}
			if ((await handle.read(Buffer.alloc(1), 0, 1, size)).bytesRead)
				throw new Error('Settings changed during read. Original file preserved.');
			throwIfAborted(signal);
			return bytes;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
			throw error;
		} finally {
			await handle?.close();
		}
	}
	/** Legacy input only. Production never writes model-preference.json again. */
	async readLegacyModel(path: string): Promise<string | undefined> {
		const bytes = await this.readBytes(path);
		if (!bytes) return undefined;
		let raw: unknown;
		try {
			raw = JSON.parse(bytes.toString('utf8'));
		} catch {
			throw new Error('Malformed legacy model preference. Original file preserved.');
		}
		if (
			typeof raw !== 'object' ||
			raw === null ||
			Array.isArray(raw) ||
			!('lastSelectedModel' in raw)
		)
			throw new Error('Invalid legacy model preference. Original file preserved.');
		const result = ModelPreferenceSchema.safeParse(raw.lastSelectedModel);
		if (!result.success)
			throw new Error('Invalid legacy model identifier. Original file preserved.');
		return result.data;
	}
	async archiveLegacyModel(path: string): Promise<void> {
		try {
			await this.io.lstat(`${path}.migrated`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				await this.io.rename(path, `${path}.migrated`);
				return;
			}
			throw error;
		}
		throw new Error('Legacy archive already exists. Original preference retained.');
	}
}
const fingerprint = (bytes: Buffer | undefined): string | undefined =>
	bytes ? createHash('sha256').update(bytes).digest('hex') : undefined;
