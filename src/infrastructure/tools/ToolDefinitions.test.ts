import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import type { ToolDefinition } from '@/domain/Tool';
import { toOllamaTool } from '@/infrastructure/model/mappers/OllamaChatMapper';

const contracts = [
	{
		name: 'list_directory',
		keys: ['path', 'depth'],
		required: [],
		mutation: false,
		deduplicate: true,
	},
	{
		name: 'find_files',
		keys: ['pattern', 'path'],
		required: ['pattern'],
		mutation: false,
		deduplicate: true,
	},
	{
		name: 'read_file',
		keys: ['path', 'startLine', 'startOffset', 'endLine'],
		required: ['path'],
		mutation: false,
		deduplicate: false,
	},
	{ name: 'search_text', keys: ['query'], required: ['query'], mutation: false, deduplicate: true },
	{
		name: 'create_file',
		keys: ['path', 'content'],
		required: ['path', 'content'],
		mutation: true,
		deduplicate: false,
	},
	{
		name: 'edit_file',
		keys: ['path', 'edits'],
		required: ['path', 'edits'],
		mutation: true,
		deduplicate: false,
	},
	{
		name: 'replace_file',
		keys: ['path', 'content', 'expectedVersion'],
		required: ['path', 'content', 'expectedVersion'],
		mutation: true,
		deduplicate: false,
	},
	{
		name: 'move_file',
		keys: ['source', 'destination'],
		required: ['source', 'destination'],
		mutation: true,
		deduplicate: false,
	},
	{ name: 'delete_path', keys: ['path'], required: ['path'], mutation: true, deduplicate: false },
] as const;

const properties = (tool: ToolDefinition): Record<string, Record<string, unknown>> =>
	tool.parameters['properties'] as Record<string, Record<string, unknown>>;

describe('production model tool definitions', () => {
	test('exposes exactly the intended tools with simple distinct inputs and lifecycle metadata', () => {
		const definitions = createLocalToolExecutor().listTools();
		expect(definitions.map((tool) => tool.name)).toEqual(
			contracts.map((contract) => contract.name),
		);
		for (const [index, contract] of contracts.entries()) {
			const tool = definitions[index]!;
			expect(tool.parameters['type']).toBe('object');
			expect(tool.parameters['additionalProperties']).toBe(false);
			expect(Object.keys(properties(tool)).sort()).toEqual([...contract.keys].sort());
			expect([...(tool.parameters['required'] as string[])].sort()).toEqual(
				[...contract.required].sort(),
			);
			expect(tool.requiresApproval === true).toBe(contract.mutation);
			expect(tool.invalidatesWorkspaceCache === true).toBe(contract.mutation);
			expect(tool.deduplicate === true).toBe(contract.deduplicate);
		}
	});

	test('describes exact edits, bounded listing and revision-protected replacement', () => {
		const definitions = new Map(
			createLocalToolExecutor()
				.listTools()
				.map((tool) => [tool.name, tool]),
		);
		expect(properties(definitions.get('list_directory')!)['depth']).toMatchObject({
			minimum: 1,
			maximum: 5,
		});
		const edits = properties(definitions.get('edit_file')!)['edits']!;
		expect(edits).toMatchObject({ type: 'array', minItems: 1, maxItems: 50 });
		expect(edits['items']).toMatchObject({
			type: 'object',
			additionalProperties: false,
			required: ['oldText', 'newText'],
		});
		expect(properties(definitions.get('replace_file')!)['expectedVersion']).toMatchObject({
			type: 'string',
			pattern: '^[a-f0-9]{64}$',
		});
		expect(
			properties(definitions.get('replace_file')!)['expectedVersion']!['description'],
		).toContain('read_file');
		expect(definitions.get('read_file')!.description).toMatch(/nextRead unchanged/);
		expect(properties(definitions.get('read_file')!)['startOffset']!['description']).toContain(
			'UTF-16',
		);
		expect(properties(definitions.get('find_files')!)['pattern']!['description']).toContain(
			'*, **, ?',
		);
		expect(definitions.get('edit_file')!.description).toMatch(/once.*original.*overlap/);
		expect(definitions.get('delete_path')!.description).toMatch(
			/empty directory.*never recursively/,
		);
	});

	test('preserves literal search and edit strings during preparation', () => {
		const executor = createLocalToolExecutor();
		expect(
			executor.prepare({ toolName: 'search_text', toolInput: { query: ' left | right ' } })
				.toolInput,
		).toEqual({ query: ' left | right ' });
		expect(
			executor.prepare({
				toolName: 'edit_file',
				toolInput: {
					path: ' file.ts ',
					edits: [{ oldText: ' before\\n ', newText: '$&\\r\\n' }],
				},
			}).toolInput,
		).toEqual({ path: 'file.ts', edits: [{ oldText: ' before\\n ', newText: '$&\\r\\n' }] });
	});

	test('states current read-derived replacement and known-content exact-edit contracts', () => {
		const definitions = createLocalToolExecutor().listTools();
		const replace = definitions.find((tool) => tool.name === 'replace_file')!;
		const edit = definitions.find((tool) => tool.name === 'edit_file')!;
		const version = properties(replace)['expectedVersion']!;
		expect(replace.description).toMatch(/entire.*existing.*UTF-8/);
		expect(replace.description).toMatch(/edit_file.*bounded exact edits/);
		expect(version['description']).toMatch(/exactly.*current version.*read_file.*this file/);
		expect(version['description']).toMatch(/Never invent or reconstruct/);
		expect(version['description']).toMatch(/unavailable or stale.*read_file again/);
		expect(edit.description).toMatch(/reliably known current content/);
		expect(edit.description).toMatch(/read_file if unknown or stale/);
		expect(edit.description).not.toContain('after reading');
	});

	test('preserves every Phase 14 name, schema constraint and lifecycle policy apart from wording', () => {
		// Baseline 645a43f: exclude only descriptions, including nested property descriptions.
		const stripDescriptions = (value: unknown): unknown => {
			if (Array.isArray(value)) return value.map(stripDescriptions);
			if (typeof value !== 'object' || value === null) return value;
			return Object.fromEntries(
				Object.entries(value)
					.filter(([key]) => key !== 'description')
					.map(([key, child]) => [key, stripDescriptions(child)]),
			);
		};
		expect(
			createHash('sha256')
				.update(JSON.stringify(stripDescriptions(createLocalToolExecutor().listTools())))
				.digest('hex'),
		).toBe('59864a09db0ffff847b3df8aa3fe59eb68519574fd01f826810a60d346f03dcb');
	});

	test('rejects obsolete and excessive capabilities through the public preparation path', () => {
		const executor = createLocalToolExecutor();
		for (const toolName of [
			'list_files',
			'search_file',
			'run_command',
			'shell',
			'create_directory',
		]) {
			expect(() => executor.prepare({ toolName, toolInput: {} })).toThrow(
				'Unknown tool requested by model',
			);
		}
		for (const request of [
			{
				toolName: 'edit_file',
				toolInput: { path: 'file.ts', oldText: 'before', newText: 'after' },
			},
			{ toolName: 'delete_path', toolInput: { path: 'src', recursive: true } },
			{ toolName: 'move_file', toolInput: { source: 'a', destination: 'b', force: true } },
			{ toolName: 'replace_file', toolInput: { path: 'file.ts', content: 'after' } },
		]) {
			expect(() => executor.prepare(request)).toThrow('Invalid arguments for tool');
		}
	});

	test('keeps production model definitions compact without constraining ordinary schema maintenance', () => {
		const definitions = createLocalToolExecutor().listTools();
		// Phase 15 removed repeated guidance from the 4,679-character nine-tool surface.
		// Keep ample maintenance headroom while catching manuals or schema duplication.
		expect(JSON.stringify(definitions.map(toOllamaTool)).length).toBeLessThanOrEqual(6_000);
		for (const tool of definitions) {
			expect(tool.description.length).toBeLessThanOrEqual(230);
			assertSchemaDescriptionsBounded(tool.parameters);
		}
	});
});

const assertSchemaDescriptionsBounded = (value: unknown): void => {
	if (typeof value !== 'object' || value === null) return;
	for (const [key, child] of Object.entries(value)) {
		if (key === 'description' && typeof child === 'string')
			expect(child.length).toBeLessThanOrEqual(140);
		else assertSchemaDescriptionsBounded(child);
	}
};
