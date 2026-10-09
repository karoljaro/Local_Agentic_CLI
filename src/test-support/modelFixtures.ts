import type { ModelContextProfile } from '@/domain/ModelContextProfile';

/** Stable fake-only identifier; never depends on a developer's environment. */
export const SYNTHETIC_MODEL = 'test-model';

/** Independent deterministic profile fixture; production defaults stay in readConfig. */
export const TEST_CONTEXT_PROFILE: ModelContextProfile = Object.freeze({
	contextWindowTokens: 16_384,
	maxOutputTokens: 4_096,
});

/** Explicitly live checks must call this instead of borrowing the fake identifier. */
export const requireLiveTestModel = (
	env: Record<string, string | undefined> = process.env,
): string => {
	const modelName = env['TEST_MODEL']?.trim();
	if (!modelName)
		throw new Error('No live test model configured. Set TEST_MODEL=<installed-model>.');
	return modelName;
};
