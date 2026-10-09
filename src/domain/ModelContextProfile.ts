/** One request's total window and independent maximum generation reservation. */
export type ModelContextProfile = Readonly<{
	contextWindowTokens: number;
	maxOutputTokens: number;
}>;

export const validateModelContextProfile = (profile: ModelContextProfile): void => {
	if (
		!Number.isSafeInteger(profile.contextWindowTokens) ||
		profile.contextWindowTokens <= 0 ||
		!Number.isSafeInteger(profile.maxOutputTokens) ||
		profile.maxOutputTokens <= 0
	) {
		throw new Error('Model context and maximum output tokens must be positive safe integers.');
	}
	if (profile.maxOutputTokens >= profile.contextWindowTokens) {
		throw new Error('Model maximum output tokens must be smaller than the context window.');
	}
};
