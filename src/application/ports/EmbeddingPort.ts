/** Independent of chat model selection. Identity includes the configured embedding source. */
export interface EmbeddingPort {
	readonly modelIdentity: string;
	embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]>;
}
