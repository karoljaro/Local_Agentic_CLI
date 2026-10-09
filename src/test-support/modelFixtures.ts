/** Stable fake-only identifier; never depends on a developer's environment. */
export const SYNTHETIC_MODEL = 'test-model';

/** Explicitly live checks must call this instead of borrowing the fake identifier. */
export const requireLiveTestModel = (
	env: Record<string, string | undefined> = process.env,
): string => {
	const modelName = env['TEST_MODEL']?.trim();
	if (!modelName)
		throw new Error('No live test model configured. Set TEST_MODEL=<installed-model>.');
	return modelName;
};
