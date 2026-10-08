import { describe, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SessionService } from '@/application/services/SessionService';
import { reduceAgentState } from '@/application/services/SessionReducer';
import { ToolRunner, type ToolApprovalHandler } from '@/application/services/ToolRunner';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asISODateTime, asSessionId } from '@/domain/Ids';
import type { ModelToolCall } from '@/domain/Tool';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import {
	assistantToolCallsCompletedEvent,
	toolCallCompletedEvent,
	toolCallRequestedEvent,
} from '@/test-support/AgentEventFixtures';
import { createDeferred } from '@/test-support/createDeferred';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';

const version = (content: string): string => createHash('sha256').update(content).digest('hex');
const sessionId = asSessionId('session-1');

const harness = (
	directory: string,
	options: Parameters<typeof createLocalToolExecutor>[0] = {},
	approve?: ToolApprovalHandler,
) => {
	const registry = createLocalToolExecutor({ ...options, workspaceRoot: directory });
	const store = new InMemorySessionStore();
	const service = new SessionService(store);
	const ids = new BunUuidV7IdGenerator();
	const approvals: string[] = [];
	const runner = new ToolRunner({
		sessionStore: service,
		toolExecutor: registry,
		idGenerator: ids,
		clock: { now: () => asISODateTime('2026-10-08T12:00:00.000Z') },
		approveToolCall:
			approve ??
			(async (request) => {
				approvals.push(request.toolName);
				return true;
			}),
	});
	const call = async (name: string, args: unknown, signal?: AbortSignal): Promise<unknown> => {
		const prepared = runner.prepareToolCalls([{ name, arguments: args }]);
		await service.appendSessionEvent(
			assistantToolCallsCompletedEvent({
				id: ids.nextEventId(),
				messageId: ids.nextMessageId(),
				toolCalls: prepared.map((record) => record.call),
			}),
		);
		await runner.executeToolCalls(sessionId, prepared, signal === undefined ? {} : { signal });
		const terminal = store.events.at(-1);
		if (terminal?.type === 'tool.call.failed') throw new Error(terminal.error.message);
		if (terminal?.type !== 'tool.call.completed') throw new Error('Expected completed tool call.');
		return terminal.output;
	};
	return { registry, runner, store, approvals, call };
};

describe('Phase 14 production tool workflows', () => {
	test('discovers a module, reads it, and applies independent edits in one approved write', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-discover-');
		try {
			await mkdir(join(directory, 'src'));
			const original = 'export const name = "old";\nexport const enabled = false;\n';
			await writeFile(join(directory, 'src', 'SessionService.ts'), original);
			const { call, approvals, store } = harness(directory);
			expect(await call('find_files', { pattern: 'Session*.ts' })).toEqual({
				files: ['src/SessionService.ts'],
				truncated: false,
			});
			expect(await call('read_file', { path: 'src/SessionService.ts' })).toMatchObject({
				path: 'src/SessionService.ts',
				content: original,
				version: version(original),
			});
			expect(
				await call('edit_file', {
					path: 'src/SessionService.ts',
					edits: [
						{ oldText: '"old"', newText: '"new"' },
						{ oldText: 'false', newText: 'true' },
					],
				}),
			).toEqual({ path: 'src/SessionService.ts', changed: true, editsApplied: 2 });
			expect(await readFile(join(directory, 'src', 'SessionService.ts'), 'utf8')).toBe(
				'export const name = "new";\nexport const enabled = true;\n',
			);
			expect(approvals).toEqual(['edit_file']);
			expect(
				store.events
					.filter((event) => event.type === 'tool.call.requested')
					.map((event) => event.approvalRequired),
			).toEqual([false, false, true]);
		} finally {
			await cleanup();
		}
	});

	test('creates several missing parents in one call and invalidates discovery before move and delete', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-create-');
		try {
			const { call, approvals } = harness(directory);
			expect(await call('list_directory', {})).toEqual({
				path: '.',
				entries: [],
				truncated: false,
			});
			const path = 'src/features/auth/services/AuthService.ts';
			expect(await call('create_file', { path, content: 'export const auth = true;\n' })).toEqual({
				path,
				created: true,
			});
			for (const parent of [
				'src',
				'src/features',
				'src/features/auth',
				'src/features/auth/services',
			])
				expect((await stat(join(directory, parent))).isDirectory()).toBe(true);
			expect(await call('list_directory', {})).toEqual({
				path: '.',
				entries: [{ path: 'src', type: 'directory' }],
				truncated: false,
			});
			expect(await call('move_file', { source: path, destination: 'src/AuthService.ts' })).toEqual({
				source: path,
				destination: 'src/AuthService.ts',
				moved: true,
			});
			expect(await call('find_files', { pattern: '*.ts' })).toEqual({
				files: ['src/AuthService.ts'],
				truncated: false,
			});
			expect(await call('delete_path', { path: 'src/AuthService.ts' })).toEqual({
				path: 'src/AuthService.ts',
				type: 'file',
				deleted: true,
			});
			expect(await call('find_files', { pattern: '*.ts' })).toEqual({
				files: [],
				truncated: false,
			});
			expect(await call('delete_path', { path: 'src/features/auth/services' })).toEqual({
				path: 'src/features/auth/services',
				type: 'directory',
				deleted: true,
			});
			expect(approvals).toEqual(['create_file', 'move_file', 'delete_path', 'delete_path']);
		} finally {
			await cleanup();
		}
	});

	test('invalid multi-edits fail through prepared execution without applying any valid edit', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-edit-rollback-');
		try {
			const original = 'prefix abcde suffix\nrepeated repeated\n';
			await writeFile(join(directory, 'file.ts'), original);
			const registry = createLocalToolExecutor({ workspaceRoot: directory });
			for (const [edits, error] of [
				[
					[
						{ oldText: 'prefix', newText: 'changed' },
						{ oldText: 'missing', newText: 'never' },
					],
					'oldText was not found',
				],
				[
					[
						{ oldText: 'prefix', newText: 'changed' },
						{ oldText: 'repeated', newText: 'never' },
					],
					'oldText appears multiple times',
				],
				[
					[
						{ oldText: 'abc', newText: 'changed' },
						{ oldText: 'cde', newText: 'never' },
					],
					'Edits overlap',
				],
			] as const) {
				const prepared = registry.prepare({
					toolName: 'edit_file',
					toolInput: { path: 'file.ts', edits },
				});
				await expect(prepared.execute()).rejects.toThrow(error);
				expect(await readFile(join(directory, 'file.ts'), 'utf8')).toBe(original);
			}
		} finally {
			await cleanup();
		}
	});

	test('a failed nested create leaves truthful parent state and invalidates cached discovery', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-create-failure-');
		let writeSpy: ReturnType<typeof spyOn> | undefined;
		try {
			const { call, store } = harness(directory);
			expect(await call('list_directory', {})).toEqual({
				path: '.',
				entries: [],
				truncated: false,
			});
			writeSpy = spyOn(fsPromises, 'writeFile').mockRejectedValue(
				new Error('simulated write failure'),
			);
			await expect(
				call('create_file', { path: 'new/deep/file.ts', content: 'never published' }),
			).rejects.toThrow('simulated write failure');
			writeSpy.mockRestore();
			writeSpy = undefined;
			expect((await stat(join(directory, 'new', 'deep'))).isDirectory()).toBe(true);
			await expect(stat(join(directory, 'new', 'deep', 'file.ts'))).rejects.toHaveProperty(
				'code',
				'ENOENT',
			);
			expect(await call('list_directory', {})).toEqual({
				path: '.',
				entries: [{ path: 'new', type: 'directory' }],
				truncated: false,
			});
			expect(store.events.filter((event) => event.type === 'tool.call.failed')).toMatchObject([
				{
					toolName: 'create_file',
					error: { code: 'TOOL_FAILED', message: 'simulated write failure' },
				},
			]);
		} finally {
			writeSpy?.mockRestore();
			await cleanup();
		}
	});

	test('cancellation after nested file writing starts records completion before stopping', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-create-cancel-');
		const originalWrite = fsPromises.writeFile;
		const controller = new AbortController();
		let writeSpy: ReturnType<typeof spyOn> | undefined;
		try {
			const { runner, store } = harness(directory);
			writeSpy = spyOn(fsPromises, 'writeFile').mockImplementation(
				async (...args: Parameters<typeof fsPromises.writeFile>) => {
					await originalWrite(...args);
					controller.abort();
				},
			);
			const records = runner.prepareToolCalls([
				{ name: 'create_file', arguments: { path: 'new/deep/file.ts', content: 'published' } },
				{ name: 'create_file', arguments: { path: 'must-not-exist.ts', content: 'never' } },
			]);
			await expect(
				runner.executeToolCalls(sessionId, records, { signal: controller.signal }),
			).rejects.toHaveProperty('name', 'AbortError');
			writeSpy.mockRestore();
			writeSpy = undefined;
			expect(await readFile(join(directory, 'new', 'deep', 'file.ts'), 'utf8')).toBe('published');
			await expect(stat(join(directory, 'must-not-exist.ts'))).rejects.toHaveProperty(
				'code',
				'ENOENT',
			);
			expect(store.events.map((event) => event.type)).toEqual([
				'tool.call.requested',
				'tool.call.started',
				'tool.call.completed',
			]);
			expect(store.events.at(-1)).toMatchObject({
				output: { path: 'new/deep/file.ts', created: true },
			});
		} finally {
			writeSpy?.mockRestore();
			await cleanup();
		}
	});

	test('successful create reports a cleanup warning and exposes a bounded cleanup workflow', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-create-cleanup-');
		let unlinkSpy: ReturnType<typeof spyOn> | undefined;
		try {
			const { call } = harness(directory);
			unlinkSpy = spyOn(fsPromises, 'unlink').mockRejectedValue(
				new Error('simulated cleanup failure'),
			);
			const result = (await call('create_file', { path: 'created.ts', content: 'complete' })) as {
				path: string;
				created: boolean;
				warnings: string[];
			};
			unlinkSpy.mockRestore();
			unlinkSpy = undefined;
			expect(result).toMatchObject({ path: 'created.ts', created: true });
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]).toContain('delete the leftover temporary file:');
			expect(result.warnings[0]).not.toContain(directory);
			expect(await readFile(join(directory, 'created.ts'), 'utf8')).toBe('complete');
			const temporary = (await fsPromises.readdir(directory)).find((path) =>
				path.startsWith('.tmp-created.ts-'),
			)!;
			expect(await call('delete_path', { path: temporary })).toEqual({
				path: temporary,
				type: 'file',
				deleted: true,
			});
			expect(await fsPromises.readdir(directory)).toEqual(['created.ts']);
		} finally {
			unlinkSpy?.mockRestore();
			await cleanup();
		}
	});

	test('searches a long file and follows exact CRLF and UTF-16 read continuation', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-continuation-');
		try {
			const content = 'SessionService😀' + '0123456789'.repeat(100) + '\r\nsecond🙂\r\n';
			await writeFile(join(directory, 'long.ts'), content);
			const { call } = harness(directory, { maxReadCharacters: 15, maxReadLines: 2 });
			expect(await call('search_text', { query: 'SessionService' })).toMatchObject({
				returnedMatches: 1,
				matches: [{ path: 'long.ts', line: 1 }],
			});
			let input: { path: string; startOffset?: number; endLine?: number } = { path: 'long.ts' };
			let reconstructed = '';
			for (let pageNumber = 0; pageNumber <= content.length; pageNumber++) {
				const page = (await call('read_file', input)) as {
					content: string;
					version: string;
					nextRead?: typeof input;
				};
				expect(page.version).toBe(version(content));
				expect(page.content).toBe(
					content.slice(reconstructed.length, reconstructed.length + page.content.length),
				);
				reconstructed += page.content;
				if (page.nextRead === undefined) break;
				expect(page.nextRead.startOffset).toBe(reconstructed.length);
				input = page.nextRead;
			}
			expect(reconstructed).toBe(content);
		} finally {
			await cleanup();
		}
	});

	test('replaces empty and existing files only with a current read version', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-replace-');
		try {
			await writeFile(join(directory, 'file.ts'), '');
			const { call, registry } = harness(directory);
			const read = (await call('read_file', { path: 'file.ts' })) as { version: string };
			expect(
				await call('replace_file', {
					path: 'file.ts',
					content: 'first',
					expectedVersion: read.version,
				}),
			).toEqual({ path: 'file.ts', changed: true });
			await expect(
				registry.execute({
					toolName: 'replace_file',
					toolInput: { path: 'file.ts', content: 'stale', expectedVersion: read.version },
				}),
			).rejects.toThrow('File changed since it was read');
			expect(await readFile(join(directory, 'file.ts'), 'utf8')).toBe('first');
			const current = (await call('read_file', { path: 'file.ts' })) as { version: string };
			const writes = spyOn(fsPromises, 'writeFile');
			try {
				expect(
					(
						await registry
							.prepare({
								toolName: 'replace_file',
								toolInput: { path: 'file.ts', content: 'first', expectedVersion: current.version },
							})
							.execute()
					).output,
				).toEqual({ path: 'file.ts', changed: false });
				expect(writes).not.toHaveBeenCalled();
			} finally {
				writes.mockRestore();
			}
		} finally {
			await cleanup();
		}
	});

	test('rejects an invalid later mutation before approval, IDs, or workspace effects', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-prepare-');
		try {
			const { runner, store, approvals, registry } = harness(directory);
			expect(() =>
				runner.prepareToolCalls([
					{ name: 'create_file', arguments: { path: 'new/a.ts', content: 'valid' } },
					{ name: 'move_file', arguments: { source: 'new/a.ts', destination: 42 } },
				]),
			).toThrow('Invalid arguments for tool move_file');
			expect(store.events).toEqual([]);
			expect(approvals).toEqual([]);
			await expect(stat(join(directory, 'new'))).rejects.toHaveProperty('code', 'ENOENT');
			await expect(
				registry.execute({
					toolName: 'edit_file',
					toolInput: { path: 'new/a.ts', oldText: 'valid', newText: 'obsolete' },
				}),
			).rejects.toThrow('Invalid arguments for tool edit_file');
		} finally {
			await cleanup();
		}
	});

	test('late approval after cancellation cannot create nested directories', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-approval-');
		try {
			const approval = createDeferred<boolean>();
			const entered = createDeferred<void>();
			const controller = new AbortController();
			const { runner, store } = harness(directory, {}, async () => {
				entered.resolve();
				return approval.promise;
			});
			const calls = runner.prepareToolCalls([
				{ name: 'create_file', arguments: { path: 'new/deep/file.ts', content: 'never' } },
			]);
			const running = runner.executeToolCalls(sessionId, calls, { signal: controller.signal });
			await entered.promise;
			controller.abort();
			await expect(running).rejects.toHaveProperty('name', 'AbortError');
			approval.resolve(true);
			await Promise.resolve();
			await expect(stat(join(directory, 'new'))).rejects.toHaveProperty('code', 'ENOENT');
			expect(store.events.map((event) => event.type)).toEqual(['tool.call.requested']);
		} finally {
			await cleanup();
		}
	});
});

describe('Phase 14 public mutation boundaries', () => {
	const mutations = (path: string): ModelToolCall[] => [
		{ name: 'create_file', arguments: { path, content: 'new' } },
		{ name: 'edit_file', arguments: { path, edits: [{ oldText: 'original', newText: 'new' }] } },
		{
			name: 'replace_file',
			arguments: { path, content: 'new', expectedVersion: version('original') },
		},
		{ name: 'move_file', arguments: { source: path, destination: 'destination.ts' } },
		{ name: 'move_file', arguments: { source: 'visible.ts', destination: path } },
		{ name: 'delete_path', arguments: { path } },
	];
	for (const path of [
		'.git/blocked.ts',
		'nested/.agent/blocked.ts',
		'.env.local',
		'.env.dev/blocked.ts',
	]) {
		test(`all mutators reject protected target ${path}`, async () => {
			const { directory, cleanup } = await createTempDirectory('phase14-protected-');
			try {
				await mkdir(join(directory, 'nested', '.agent'), { recursive: true });
				await mkdir(join(directory, '.git'));
				await mkdir(join(directory, '.env.dev'));
				await writeFile(join(directory, path), 'original');
				await writeFile(join(directory, 'visible.ts'), 'original');
				const registry = createLocalToolExecutor({ workspaceRoot: directory });
				for (const mutation of mutations(path))
					await expect(
						registry.prepare({ toolName: mutation.name, toolInput: mutation.arguments }).execute(),
					).rejects.toThrow('protected');
				expect(await readFile(join(directory, path), 'utf8')).toBe('original');
				expect(await readFile(join(directory, 'visible.ts'), 'utf8')).toBe('original');
			} finally {
				await cleanup();
			}
		});
	}

	test('all mutators reject an escaping symlink parent', async () => {
		const workspace = await createTempDirectory('phase14-symlink-');
		const outside = await createTempDirectory('phase14-outside-');
		try {
			await writeFile(join(outside.directory, 'outside.ts'), 'original');
			await writeFile(join(workspace.directory, 'visible.ts'), 'original');
			await symlink(outside.directory, join(workspace.directory, 'escape'));
			const registry = createLocalToolExecutor({ workspaceRoot: workspace.directory });
			for (const mutation of mutations('escape/outside.ts'))
				await expect(
					registry.execute({ toolName: mutation.name, toolInput: mutation.arguments }),
				).rejects.toThrow(/outside workspace|Symbolic links/);
			expect(await readFile(join(outside.directory, 'outside.ts'), 'utf8')).toBe('original');
			expect(await readFile(join(workspace.directory, 'visible.ts'), 'utf8')).toBe('original');
		} finally {
			await workspace.cleanup();
			await outside.cleanup();
		}
	});

	test('every mutator rejects an already-aborted prepared execution without changing paths', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-aborted-');
		try {
			await writeFile(join(directory, 'visible.ts'), 'original');
			const registry = createLocalToolExecutor({ workspaceRoot: directory });
			const controller = new AbortController();
			controller.abort();
			for (const mutation of mutations('visible.ts'))
				await expect(
					registry
						.prepare({ toolName: mutation.name, toolInput: mutation.arguments })
						.execute({ signal: controller.signal }),
				).rejects.toHaveProperty('name', 'AbortError');
			expect(await readFile(join(directory, 'visible.ts'), 'utf8')).toBe('original');
			await expect(stat(join(directory, 'destination.ts'))).rejects.toHaveProperty(
				'code',
				'ENOENT',
			);
		} finally {
			await cleanup();
		}
	});

	test('historical names remain readable after their definitions are removed', async () => {
		const { directory, cleanup } = await createTempDirectory('phase14-replay-');
		try {
			const store = new JsonlSessionStore(join(directory, 'sessions'));
			const events = [
				toolCallRequestedEvent({ toolName: 'search_file', toolInput: { query: 'old|syntax' } }),
				toolCallCompletedEvent({
					toolName: 'search_file',
					output: { matches: [{ path: 'old.ts', line: 1, text: 'old' }] },
				}),
			];
			for (const event of events) await store.appendSessionEvent(event);
			const replayed = await store.readSessionEvents(sessionId);
			expect(replayed).toEqual(events);
			expect(reduceAgentState(sessionId, replayed).messages).toMatchObject([
				{
					role: 'assistant',
					toolCalls: [{ name: 'search_file', arguments: { query: 'old|syntax' } }],
				},
				{ role: 'tool', toolName: 'search_file' },
			]);
			const currentNames = createLocalToolExecutor({ workspaceRoot: directory })
				.listTools()
				.map((tool) => tool.name);
			expect(currentNames).not.toContain('search_file');
			expect(currentNames).not.toContain('list_files');
		} finally {
			await cleanup();
		}
	});
});
