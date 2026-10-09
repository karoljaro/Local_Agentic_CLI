/** Application convenience state, independent of conversation history. */
export interface ModelPreferencePort {
	readLastSelectedModel(): Promise<string | undefined>;
	writeLastSelectedModel(modelName: string): Promise<void>;
}
