import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelPort, ModelStreamChunk } from '@/application/ports/ModelPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { SessionService } from '@/application/services/SessionService';
import { RunAgentTurn } from '@/application/use-cases/RunAgentTurn';
import { readConfig } from '@/composition/config';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asISODateTime, asSessionId } from '@/domain/Ids';
import { OllamaModelAdapter } from '@/infrastructure/model/OllamaModelAdapter';
import { OllamaModelCatalog } from '@/infrastructure/model/OllamaModelCatalog';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { requireLiveTestModel } from '@/test-support/modelFixtures';

// Optional: one isolated read-only workflow, one 45-second aggregate deadline.
// No downloads, retries, model fallback, tuning, activation experiment or long-history run.
const smoke = async (): Promise<void> => {
	let modelName: string;
	try {
		modelName = requireLiveTestModel();
	} catch (error) {
		console.log(`SKIP: ${(error as Error).message}`);
		return;
	}
	const signal = AbortSignal.timeout(45_000);
	const config = readConfig();
	if (config.MODEL_CONTEXT_TOKENS !== 16_384 || config.MODEL_MAX_OUTPUT_TOKENS !== 4_096) {
		throw new Error('This smoke requires the Phase 16 default 16384/4096 profile.');
	}
	console.log(`Live context smoke: ${modelName}; 45-second aggregate deadline.`);
	const { models } = await new OllamaModelCatalog(config.OLLAMA_BASE_URL).listModels({ signal });
	if (!models.some((model) => model.name === modelName)) {
		console.log(`SKIP: TEST_MODEL "${modelName}" is not installed. No download attempted.`);
		return;
	}
	const temp = await createTempDirectory('codesh-context-smoke-');
	try {
		await writeFile(join(temp.directory, 'smoke.conf'), 'answer=42\n');
		const store = new InMemorySessionStore();
		const tools = createLocalToolExecutor({ workspaceRoot: temp.directory });
		const compiler = new ContextBuilder({
			systemPrompt: config.SYSTEM_PROMPT,
			contextProfile: {
				contextWindowTokens: config.MODEL_CONTEXT_TOKENS,
				maxOutputTokens: config.MODEL_MAX_OUTPUT_TOKENS,
			},
		});
		const adapter = new OllamaModelAdapter(
			config.OLLAMA_BASE_URL,
			modelName,
			config.OLLAMA_KEEP_ALIVE,
		);
		let rounds = 0;
		const finals: ModelStreamChunk[] = [];
		const model: ModelPort = {
			async *streamChat(input) {
				if (++rounds > 3) throw new Error('Smoke stopped after three model rounds.');
				const canonical = await new SessionService(store).readSessionState(
					asSessionId('context-smoke'),
				);
				const { diagnostics } = compiler.build(canonical, input.tools);
				console.log(
					JSON.stringify({
						round: rounds,
						contextProfile: input.contextProfile,
						tools: input.tools?.length,
						diagnostics,
					}),
				);
				for await (const chunk of adapter.streamChat(input)) {
					if (chunk.finishReason !== undefined || chunk.usage !== undefined) {
						finals.push(chunk);
						console.log(
							JSON.stringify({
								round: rounds,
								providerReported: { finishReason: chunk.finishReason, usage: chunk.usage },
							}),
						);
					}
					yield chunk;
				}
			},
		};
		const loop = new RunAgentTurn({
			sessionStore: new SessionService(store),
			model,
			contextBuilder: compiler,
			toolExecutor: tools,
			idGenerator: new BunUuidV7IdGenerator(),
			clock: { now: () => asISODateTime(new Date().toISOString()) },
			approveToolCall: async () => false,
		});
		for await (const _chunk of loop.run({
			sessionId: asSessionId('context-smoke'),
			prompt:
				'Read smoke.conf with read_file, then report the value of answer in one short sentence. No other file operations.',
			modelName,
			signal,
		})) {
			// Only diagnostics are printed; no change to production streaming or normal assistant output.
		}
		if (
			rounds < 2 ||
			store.events.filter((event) => event.type === 'tool.call.completed').length !== 1 ||
			store.events.some((event) => event.type === 'tool.call.failed')
		)
			throw new Error('The expected single-read multi-round workflow did not complete.');
		const last = store.events.at(-1);
		if (last?.type !== 'assistant.message.completed' || !last.content.includes('42'))
			throw new Error('The final answer did not report the fixture value.');
		if (finals.some((chunk) => chunk.finishReason === 'length'))
			throw new Error('Provider reported length exhaustion.');
		if (
			finals.some(
				(chunk) =>
					(chunk.usage?.promptTokens ?? 0) + (chunk.usage?.outputTokens ?? 0) >=
					config.MODEL_CONTEXT_TOKENS,
			)
		)
			throw new Error('Provider-reported usage reached the context boundary.');
		console.log(
			`PASS: ${rounds} rounds; explicit 16384/4096 profile, nine tools, exact current chain, normal answer.`,
		);
	} finally {
		await temp.cleanup();
	}
};

try {
	await smoke();
} catch (error) {
	console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
