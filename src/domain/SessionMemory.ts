import { z } from 'zod';

export const MEMORY_CAPS = {
	decisions: 8,
	constraints: 8,
	files: 12,
	completed: 4,
	pending: 6,
	problems: 4,
} as const;
export const MEMORY_TOKEN_CAP = 1200;
export const MEMORY_MAX_BYTES = 64 * 1024;
export const MEMORY_UPDATER_VERSION = 'structured-delta-v1';

const identity = z.string().min(1).max(128);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const text = z
	.string()
	.min(1)
	.max(160)
	.regex(/^[^\r\n\x00-\x1f]+$/);
export const memoryPath = z
	.string()
	.min(1)
	.max(240)
	.refine(
		(path) =>
			!path.startsWith('/') &&
			!path.includes('\\') &&
			!path.split('/').some((part) => !part || part === '.' || part === '..') &&
			!/[\x00-\x1f]/.test(path),
	);
const sources = {
	sourceMessageIds: z.array(identity).min(1).max(3),
	sourceEventIds: z.array(identity).max(3),
	revision: z.number().int().nonnegative(),
};
export const MemoryItemSchema = z.strictObject({
	key,
	text,
	basis: z.enum(['user-sourced', 'assistant-reported', 'tool-observed']),
	...sources,
});
export const MemoryFileSchema = z.strictObject({
	path: memoryPath,
	activity: z.enum(['read', 'modified', 'created', 'moved', 'deleted']),
	from: memoryPath.optional(),
	...sources,
});
export const SessionMemorySchema = z.strictObject({
	goal: MemoryItemSchema.extend({
		key: z.literal('goal'),
		text: z
			.string()
			.min(1)
			.max(240)
			.regex(/^[^\r\n\x00-\x1f]+$/),
	}).nullable(),
	decisions: z.array(MemoryItemSchema).max(MEMORY_CAPS.decisions),
	constraints: z.array(MemoryItemSchema).max(MEMORY_CAPS.constraints),
	files: z.array(MemoryFileSchema).max(MEMORY_CAPS.files),
	completed: z.array(MemoryItemSchema).max(MEMORY_CAPS.completed),
	pending: z.array(MemoryItemSchema).max(MEMORY_CAPS.pending),
	problems: z.array(MemoryItemSchema).max(MEMORY_CAPS.problems),
});
export const MemoryBoundarySchema = z.strictObject({
	eventCount: z.number().int().nonnegative(),
	lastEventId: identity.nullable(),
	digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export const SessionMemoryDocumentSchema = z
	.strictObject({
		version: z.literal(1),
		sessionId: identity,
		source: MemoryBoundarySchema,
		updater: z.strictObject({
			version: z.literal(MEMORY_UPDATER_VERSION),
			model: identity.nullable(),
			status: z.enum(['unavailable', 'updated', 'failed']),
		}),
		memory: SessionMemorySchema,
	})
	.superRefine((document, ctx) => {
		for (const category of Object.keys(MEMORY_CAPS) as (keyof typeof MEMORY_CAPS)[]) {
			const entries = document.memory[category];
			const keys = entries.map((entry) => ('key' in entry ? entry.key : entry.path));
			if (new Set(keys).size !== keys.length)
				ctx.addIssue({ code: 'custom', message: `Duplicate ${category} identity.` });
		}
	});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export type MemoryFile = z.infer<typeof MemoryFileSchema>;
export type SessionMemory = z.infer<typeof SessionMemorySchema>;
export type SessionMemoryDocument = z.infer<typeof SessionMemoryDocumentSchema>;
export type MemoryBoundary = z.infer<typeof MemoryBoundarySchema>;
export type SemanticCategory = Exclude<keyof typeof MEMORY_CAPS, 'files'>;
export const emptySessionMemory = (): SessionMemory => ({
	goal: null,
	decisions: [],
	constraints: [],
	files: [],
	completed: [],
	pending: [],
	problems: [],
});

// Quotes are transient validation inputs; persisted provenance contains identities only.
const evidence = z.strictObject({ messageId: identity, quote: z.string().min(1).max(240) });
export const MemoryDeltaSchema = z.strictObject({
	version: z.literal(1),
	goal: z
		.strictObject({
			mode: z.enum(['initial', 'explicit-replacement']),
			text: z
				.string()
				.min(1)
				.max(240)
				.regex(/^[^\r\n\x00-\x1f]+$/),
			evidence,
		})
		.nullable(),
	changes: z
		.array(
			z.discriminatedUnion('operation', [
				z.strictObject({
					operation: z.literal('upsert'),
					category: z.enum(['decisions', 'constraints', 'completed', 'pending', 'problems']),
					key,
					text,
					evidence,
				}),
				z.strictObject({
					operation: z.literal('remove'),
					category: z.enum(['decisions', 'constraints', 'completed', 'pending', 'problems']),
					key,
					evidence,
				}),
			]),
		)
		.max(12),
});
export type MemoryDelta = z.infer<typeof MemoryDeltaSchema>;
