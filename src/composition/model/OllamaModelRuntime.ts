import type {
	ListModelsOptions,
	ListModelsResult,
	ModelCatalogPort,
} from '@/application/ports/ModelCatalogPort';
import type {
	ModelChatInput,
	ModelMemoryPort,
	ModelPort,
	ModelStreamChunk,
	UnloadModelInput,
} from '@/application/ports/ModelPort';
import type { AppConfig } from '@/composition/config';
import { abortError, isAbortError, throwIfAborted } from '@/application/services/cancellation';
import { OllamaModelAdapter } from '@/infrastructure/model/OllamaModelAdapter';
import { OllamaModelCatalog } from '@/infrastructure/model/OllamaModelCatalog';
import { normalizeOllamaModelName } from '@/infrastructure/model/ollama/OllamaConfig';

export type RuntimeListModelsOptions = ListModelsOptions & {
	forceRefresh?: boolean | undefined;
};

export class OllamaModelRuntime implements ModelPort, ModelMemoryPort {
	private readonly config: AppConfig;
	private readonly modelCatalog: ModelCatalogPort;
	private currentModelName: string;
	private currentModel: OllamaModelAdapter;
	private modelListCache: ListModelsResult | undefined;
	private modelListPromise: Promise<ListModelsResult> | undefined;

	constructor(config: AppConfig) {
		this.config = config;
		this.currentModelName = normalizeOllamaModelName(config.OLLAMA_MODEL);
		this.currentModel = this.createModel(this.currentModelName);
		this.modelCatalog = new OllamaModelCatalog(config.OLLAMA_BASE_URL);
	}

	getModelName(): string {
		return this.currentModelName;
	}

	streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		return this.currentModel.streamChat(input);
	}

	unload(input?: UnloadModelInput | undefined): Promise<void> {
		return this.currentModel.unload(input);
	}

	async switchModel(modelName: string, signal?: AbortSignal): Promise<string> {
		const nextModelName = normalizeOllamaModelName(modelName);
		throwIfAborted(signal);
		try {
			await this.unload(signal === undefined ? {} : { signal });
		} catch (error) {
			if (signal?.aborted && (error === signal.reason || isAbortError(error))) {
				throw abortError();
			}
			throw error;
		}
		throwIfAborted(signal);
		const nextModel = this.createModel(nextModelName);
		throwIfAborted(signal);
		this.currentModelName = nextModelName;
		this.currentModel = nextModel;
		return nextModelName;
	}

	listModels(options: RuntimeListModelsOptions = {}): Promise<ListModelsResult> {
		if (options.forceRefresh !== true && this.modelListCache !== undefined) {
			return Promise.resolve(this.modelListCache);
		}

		if (options.forceRefresh !== true && this.modelListPromise !== undefined) {
			return this.modelListPromise;
		}

		const loadModels = this.modelCatalog
			.listModels({ signal: options.signal })
			.then((result) => {
				this.modelListCache = result;
				return result;
			})
			.finally(() => {
				if (this.modelListPromise === loadModels) {
					this.modelListPromise = undefined;
				}
			});

		this.modelListPromise = loadModels;

		return loadModels;
	}

	private createModel(modelName: string): OllamaModelAdapter {
		return new OllamaModelAdapter(
			this.config.OLLAMA_BASE_URL,
			modelName,
			this.config.OLLAMA_KEEP_ALIVE,
		);
	}
}
