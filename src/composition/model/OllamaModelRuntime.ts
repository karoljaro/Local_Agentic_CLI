import type { ModelPreferencePort } from '@/application/ports/ModelPreferencePort';
import { ModelSelection } from '@/application/services/ModelSelection';
import type { AppConfig } from '@/composition/config';
import { OllamaModelAdapter } from '@/infrastructure/model/OllamaModelAdapter';
import { OllamaModelCatalog } from '@/infrastructure/model/OllamaModelCatalog';
import { JsonModelPreferenceStore } from '@/infrastructure/persistence/JsonModelPreferenceStore';

export type { RuntimeListModelsOptions } from '@/application/services/ModelSelection';

/** Provider composition only; selection policy lives in the application layer. */
export class OllamaModelRuntime extends ModelSelection {
	constructor(config: AppConfig, preference: ModelPreferencePort = new JsonModelPreferenceStore()) {
		super({
			configuredModel: config.OLLAMA_MODEL,
			catalog: new OllamaModelCatalog(config.OLLAMA_BASE_URL),
			createModel: (name) =>
				new OllamaModelAdapter(config.OLLAMA_BASE_URL, name, config.OLLAMA_KEEP_ALIVE),
			preference,
		});
	}
}
