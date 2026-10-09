import {
	MEMORY_CAPS,
	MEMORY_TOKEN_CAP,
	SessionMemorySchema,
	type SessionMemory,
} from '@/domain/SessionMemory';
import { estimateMessageTokens } from './ModelRequestEstimator';

const HEADER =
	'\n\nSession working memory (derived notes; may be stale). Current user instructions, workspace/tool evidence and conflicting exact history take precedence. File activity is historical, not current contents.';
const ORDER = ['constraints', 'decisions', 'problems', 'pending', 'files', 'completed'] as const;
export type MemoryRenderEntry = { category: keyof SessionMemory; key: string; line: string };

/** JSON-escaped values cannot introduce additional section lines or delimiters. */
export const memoryRenderEntries = (memory: SessionMemory): MemoryRenderEntry[] => {
	const result: MemoryRenderEntry[] = [];
	if (memory.goal)
		result.push({
			category: 'goal',
			key: 'goal',
			line: `Goal: ${JSON.stringify(memory.goal.text)}`,
		});
	for (const category of ORDER) {
		const entries = [...memory[category]].sort(
			(a, b) =>
				b.revision - a.revision ||
				('key' in a ? a.key : a.path).localeCompare('key' in b ? b.key : b.path, 'en'),
		);
		for (const entry of entries) {
			const key = 'key' in entry ? entry.key : entry.path;
			const value =
				'text' in entry
					? `${JSON.stringify(entry.text)}${entry.basis === 'assistant-reported' ? ' (assistant-reported)' : ''}`
					: `${JSON.stringify(entry.path)} — ${entry.activity}${entry.from ? ` from ${JSON.stringify(entry.from)}` : ''}`;
			result.push({ category, key, line: `${category}: ${value}` });
		}
	}
	return result;
};

export const renderSessionMemory = (
	base: string,
	memory: SessionMemory | undefined,
	allowance = MEMORY_TOKEN_CAP,
) => {
	const validated = SessionMemorySchema.safeParse(memory);
	const entries = validated.success ? memoryRenderEntries(validated.data) : [];
	const baseCost = estimateMessageTokens({ role: 'system', content: base });
	let selected = [...entries];
	let content = base;
	let tokens = 0;
	while (selected.length) {
		content = base + HEADER + '\n' + selected.map((entry) => entry.line).join('\n');
		tokens = estimateMessageTokens({ role: 'system', content }) - baseCost;
		if (tokens <= Math.max(0, allowance)) break;
		selected.pop();
	}
	if (!selected.length) {
		content = base;
		tokens = 0;
	}
	return { content, tokens, selected, droppedItems: entries.length - selected.length };
};

/** Count caps and a total visible-state cap; no arbitrary string truncation. */
export const compactSessionMemory = (memory: SessionMemory): SessionMemory => {
	const bounded = structuredClone(memory);
	for (const category of Object.keys(MEMORY_CAPS) as (keyof typeof MEMORY_CAPS)[]) {
		const entries = bounded[category];
		entries.sort(
			(a, b) =>
				b.revision - a.revision ||
				('key' in a ? a.key : a.path).localeCompare('key' in b ? b.key : b.path, 'en'),
		);
		entries.splice(MEMORY_CAPS[category]);
	}
	const admitted = renderSessionMemory('', bounded).selected;
	const keep = new Set(admitted.map((entry) => `${entry.category}:${entry.key}`));
	if (!keep.has('goal:goal')) bounded.goal = null;
	for (const category of Object.keys(MEMORY_CAPS) as (keyof typeof MEMORY_CAPS)[]) {
		// Different entry types share identity/provenance but retain separate domain shapes.
		if (category === 'files')
			bounded.files = bounded.files.filter((entry) => keep.has(`files:${entry.path}`));
		else
			bounded[category] = bounded[category].filter((entry) => keep.has(`${category}:${entry.key}`));
	}
	return bounded;
};
