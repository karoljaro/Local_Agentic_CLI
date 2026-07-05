export type ListedModel = {
	name: string;
	modifiedAt?: string;
	parameterSize?: string;
	quantizationLevel?: string;
	sizeBytes?: number;
};

export type ListModelsResult = {
	models: ListedModel[];
};

export type ListModelsOptions = {
	signal?: AbortSignal | undefined;
};

export interface ModelCatalogPort {
	listModels(options?: ListModelsOptions): Promise<ListModelsResult>;
}
