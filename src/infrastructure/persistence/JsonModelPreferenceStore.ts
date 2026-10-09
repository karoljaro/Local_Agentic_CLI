import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ModelPreferencePort } from '@/application/ports/ModelPreferencePort';

export class JsonModelPreferenceStore implements ModelPreferencePort {
	constructor(private readonly filePath = '.agent/model-preference.json') {}

	async readLastSelectedModel(): Promise<string | undefined> {
		try {
			const value: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
			if (
				typeof value !== 'object' ||
				value === null ||
				Array.isArray(value) ||
				!('lastSelectedModel' in value)
			)
				return undefined;
			const name = value.lastSelectedModel;
			return typeof name === 'string' && name.trim().length > 0 ? name.trim() : undefined;
		} catch {
			// A missing, corrupt or unreadable convenience preference cannot prevent startup.
			return undefined;
		}
	}

	async writeLastSelectedModel(modelName: string): Promise<void> {
		const name = modelName.trim();
		if (!name) throw new Error('Remembered model name cannot be empty.');
		await mkdir(dirname(this.filePath), { recursive: true });
		const temporary = `${this.filePath}.${randomUUID()}.tmp`;
		const handle = await open(temporary, 'wx', 0o600);
		try {
			await handle.writeFile(`${JSON.stringify({ lastSelectedModel: name })}\n`, 'utf8');
			await handle.close();
			await rename(temporary, this.filePath);
		} catch (error) {
			await handle.close().catch(() => undefined);
			await unlink(temporary).catch(() => undefined);
			throw error;
		}
	}
}
