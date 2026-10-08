import { expect, test } from 'bun:test';
import { z } from 'zod';
import { defineLocalTool } from './LocalTool';

test('prepared serializable call data cannot mutate bound normalized execution', async () => {
	let parses = 0;
	const tool = defineLocalTool({
		name: 'test',
		description: 'Test',
		inputSchema: z
			.strictObject({ edits: z.array(z.strictObject({ text: z.string().trim() })) })
			.transform((input) => {
				parses++;
				return input;
			}),
		execute: async (input) => input,
	});
	const raw = { edits: [{ text: ' original ' }] };
	const execution = tool.prepare(raw);
	raw.edits[0]!.text = 'raw mutation';
	(execution.toolInput as typeof raw).edits[0]!.text = 'projection mutation';
	expect((await execution.execute()).output).toEqual({ edits: [{ text: 'original' }] });
	expect(parses).toBe(1);
});
