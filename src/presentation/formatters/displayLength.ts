export const displayLength = (value: string): number => {
	// Handles surrogate pairs such as emoji. Swap to string-width later if full CJK width is needed.
	return Array.from(value).length;
};
