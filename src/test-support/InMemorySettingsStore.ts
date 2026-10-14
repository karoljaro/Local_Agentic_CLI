import type { SettingsStorePort } from '@/application/ports/SettingsPort';
import { parseSettingsDocument, type SettingsDocument } from '@/domain/UserSettings';
import { throwIfAborted } from '@/application/services/cancellation';

/** Disposable fake, with the same serialized read/modify boundary as disk storage. */
export class InMemorySettingsStore implements SettingsStorePort {
	readonly path = '/test-config/codesh/settings.json';
	document: SettingsDocument | undefined;
	private tail = Promise.resolve();
	async read(): Promise<SettingsDocument | undefined> {
		return this.document && structuredClone(this.document);
	}
	update(
		change: (current: SettingsDocument | undefined) => SettingsDocument,
		signal?: AbortSignal,
	): Promise<SettingsDocument> {
		const work = this.tail.then(() => {
			throwIfAborted(signal);
			this.document = parseSettingsDocument(change(this.document));
			return structuredClone(this.document);
		});
		this.tail = work.then(
			() => undefined,
			() => undefined,
		);
		return work;
	}
	whenIdle(): Promise<void> {
		return this.tail;
	}
}
