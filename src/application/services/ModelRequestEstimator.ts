import type { ModelMessage } from '@/domain/ModelMessage';
import type { ToolDefinition } from '@/domain/Tool';

// Conservative estimates, not model-aligned token counts. JSON includes escaping
// and structured data; provider templates need the compiler's safety reserve.
const FRAMING_TOKENS_PER_STRUCTURE = 16;
export const ESTIMATED_REQUEST_FRAMING_TOKENS = 32;

export const estimateMessageTokens = (message: ModelMessage): number => {
	const visible = {
		role: message.role,
		content: message.content,
		...(message.role === 'assistant' && message.toolCalls !== undefined
			? {
					toolCalls: message.toolCalls.map(({ name, arguments: args }) => ({
						name,
						arguments: args,
					})),
				}
			: {}),
		...(message.role === 'tool' ? { toolName: message.toolName } : {}),
	};
	return estimateStructureTokens(visible);
};

export const estimateToolTokens = ({ name, description, parameters }: ToolDefinition): number =>
	estimateStructureTokens({ name, description, parameters });

const encoder = new TextEncoder();

const estimateStructureTokens = (value: unknown): number => {
	const bytes = encoder.encode(JSON.stringify(value));
	let asciiBytes = 0;
	for (const byte of bytes) {
		if (byte < 128) asciiBytes += 1;
	}
	// More conservative than the common English 4 chars/token heuristic. Count
	// non-ASCII bytes individually rather than assuming English token density.
	return Math.ceil(asciiBytes / 3) + (bytes.length - asciiBytes) + FRAMING_TOKENS_PER_STRUCTURE;
};
