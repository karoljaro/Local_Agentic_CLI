import type {
	ListModelsOptions,
	ListModelsResult,
	ModelCatalogPort,
} from '../ports/ModelCatalogPort';
import type { ModelActivationPort } from '../ports/ModelActivationPort';
import type { ModelPreferencePort } from '../ports/ModelPreferencePort';
import type {
	ModelChatInput,
	ModelMemoryPort,
	ModelPort,
	ModelStreamChunk,
	UnloadModelInput,
} from '../ports/ModelPort';
import { abortError, isAbortError, throwIfAborted } from './cancellation';

export const MODEL_RECOVERY_HINT = 'Use /model to choose another installed model.';
const SELECTION_REQUIRED = 'No available model is selected. Use /model to choose one.';

/** Infrastructure supplies this classification; policy never inspects provider payloads. */
export class ModelUseError extends Error {
	constructor(
		readonly kind: 'unavailable' | 'unsupported',
		message: string,
		cause?: unknown,
	) {
		super(`${message} ${MODEL_RECOVERY_HINT}`, { cause });
		this.name = 'ModelUseError';
	}
}

export type ModelSelectionState =
	| { status: 'selected'; modelName: string; warning?: string }
	| { status: 'unresolved' | 'selection-required' | 'unavailable' | 'no-models'; message: string };

export type RuntimeListModelsOptions = ListModelsOptions & { forceRefresh?: boolean | undefined };
type ManagedModel = ModelPort & ModelMemoryPort & ModelActivationPort;
type Dependencies = {
	configuredModel?: string | undefined;
	catalog: ModelCatalogPort;
	createModel: (modelName: string) => ManagedModel;
	preference: ModelPreferencePort;
};

/** Owns current selection; provider residency and historical event metadata remain separate. */
export class ModelSelection implements ModelPort, ModelMemoryPort {
	private state: ModelSelectionState = {
		status: 'unresolved',
		message: 'Checking available models…',
	};
	private currentModel: ManagedModel | undefined;
	private initialized = false;
	private modelListCache: ListModelsResult | undefined;
	private modelListPromise: Promise<ListModelsResult> | undefined;
	private modelListVersion = 0;
	private selectionTail: Promise<void> = Promise.resolve();

	constructor(private readonly dependencies: Dependencies) {}

	getModelName(): string | undefined {
		return this.state.status === 'selected' ? this.state.modelName : undefined;
	}

	getModelSelection(): ModelSelectionState {
		return { ...this.state };
	}

	initialize(signal?: AbortSignal): Promise<ModelSelectionState> {
		return this.withSelection(async () => {
			throwIfAborted(signal);
			if (this.initialized) return this.getModelSelection();
			try {
				const { models } = await this.listModels({ signal, forceRefresh: true });
				const remembered = await this.dependencies.preference
					.readLastSelectedModel()
					.catch(() => undefined);
				throwIfAborted(signal);
				const configured = this.dependencies.configuredModel;
				let modelName: string | undefined;
				if (configured !== undefined) {
					if (models.some((model) => model.name === configured)) modelName = configured;
					else
						this.state = {
							status: 'unavailable',
							message: `Configured model "${configured}" is unavailable. ${MODEL_RECOVERY_HINT}`,
						};
				} else if (remembered !== undefined && models.some((model) => model.name === remembered)) {
					modelName = remembered;
				} else if (models.length === 1) {
					modelName = models[0]!.name;
				} else {
					this.state =
						models.length === 0
							? {
									status: 'no-models',
									message:
										'No models are available. Install a model in your provider, then use /model.',
								}
							: { status: 'selection-required', message: SELECTION_REQUIRED };
				}
				if (modelName !== undefined) {
					this.currentModel = this.dependencies.createModel(modelName);
					this.state = { status: 'selected', modelName };
				}
				this.initialized = true;
			} catch (error) {
				if (signal?.aborted && (error === signal.reason || isAbortError(error))) throw abortError();
				this.clearSelection({
					status: 'unresolved',
					message: `Could not resolve available models: ${errorMessage(error)}`,
				});
			}
			return this.getModelSelection();
		});
	}

	/** Refresh at turn boundaries, before the prompt is committed with current model metadata. */
	async requireModel(signal?: AbortSignal): Promise<string> {
		const wasInitialized = this.initialized;
		await this.initialize(signal);
		if (wasInitialized && this.currentModel !== undefined)
			await this.listModels({ signal, forceRefresh: true });
		throwIfAborted(signal);
		if (this.state.status !== 'selected') throw new Error(this.state.message);
		return this.state.modelName;
	}

	async *streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		const current = this.currentModel;
		if (current === undefined)
			throw new Error(this.state.status === 'selected' ? SELECTION_REQUIRED : this.state.message);
		try {
			yield* current.streamChat(input);
		} catch (error) {
			if (
				error instanceof ModelUseError &&
				error.kind === 'unavailable' &&
				current === this.currentModel
			) {
				this.clearSelection({ status: 'unavailable', message: error.message });
			}
			throw error;
		}
	}

	async unload(input?: UnloadModelInput): Promise<void> {
		await this.currentModel?.unload(input);
	}

	switchModel(modelName: string, signal?: AbortSignal): Promise<string> {
		return this.withSelection(async () => {
			const nextName = modelName.trim();
			if (!nextName) throw new Error('Model name cannot be empty.');
			throwIfAborted(signal);
			const previous = this.currentModel;
			const previousName = this.getModelName();
			try {
				const { models } = await this.listModels({ signal, forceRefresh: true });
				if (!models.some((model) => model.name === nextName)) {
					throw new ModelUseError('unavailable', `Selected model "${nextName}" is unavailable.`);
				}
				throwIfAborted(signal);
				const options = signal === undefined ? {} : { signal };
				if (previous !== undefined && previousName !== nextName) {
					await previous.unload(options);
					this.clearSelection({ status: 'selection-required', message: SELECTION_REQUIRED });
				}
				throwIfAborted(signal);
				const next = this.dependencies.createModel(nextName);
				throwIfAborted(signal);
				this.clearSelection({ status: 'selection-required', message: SELECTION_REQUIRED });
				await next.activate(options);
				throwIfAborted(signal);
				this.currentModel = next;
				this.state = { status: 'selected', modelName: nextName };
				this.initialized = true;
				try {
					await this.dependencies.preference.writeLastSelectedModel(nextName);
				} catch (error) {
					this.state = {
						status: 'selected',
						modelName: nextName,
						warning: `Model selected, but could not remember the preference: ${errorMessage(error)}`,
					};
				}
				return nextName;
			} catch (error) {
				if (signal?.aborted && (error === signal.reason || isAbortError(error))) throw abortError();
				throw error;
			}
		});
	}

	listModels(options: RuntimeListModelsOptions = {}): Promise<ListModelsResult> {
		if (options.forceRefresh !== true && this.modelListCache !== undefined)
			return Promise.resolve(this.modelListCache);
		if (options.forceRefresh !== true && this.modelListPromise !== undefined)
			return this.modelListPromise;
		const version = ++this.modelListVersion;
		const load = this.dependencies.catalog
			.listModels({ signal: options.signal })
			.then((result) => {
				throwIfAborted(options.signal);
				if (version !== this.modelListVersion) return result;
				this.modelListCache = result;
				const selected = this.getModelName();
				if (selected !== undefined && !result.models.some((model) => model.name === selected)) {
					this.clearSelection({
						status: 'unavailable',
						message: `Selected model "${selected}" is unavailable. ${MODEL_RECOVERY_HINT}`,
					});
				}
				return result;
			})
			.finally(() => {
				if (this.modelListPromise === load) this.modelListPromise = undefined;
			});
		this.modelListPromise = load;
		return load;
	}

	private clearSelection(state: ModelSelectionState): void {
		this.currentModel = undefined;
		this.state = state;
	}

	private withSelection<T>(work: () => Promise<T>): Promise<T> {
		const result = this.selectionTail.then(work);
		this.selectionTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}
}

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
