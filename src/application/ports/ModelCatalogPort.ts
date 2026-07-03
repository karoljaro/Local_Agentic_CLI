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

export interface ModelCatalogPort {
	listModels(): Promise<ListModelsResult>;
}
