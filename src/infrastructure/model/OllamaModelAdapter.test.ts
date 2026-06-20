import { describe, expect, test } from "bun:test";

import { asMessageId, asToolCallId } from "@/domain/Ids";
import type { ModelStreamChunk } from "@/application/ports/ModelPort";

import { OllamaModelAdapter } from "./OllamaModelAdapter";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const collectStream = async (
	stream: AsyncIterable<ModelStreamChunk>,
): Promise<ModelStreamChunk[]> => {
	const chunks: ModelStreamChunk[] = [];

	for await (const chunk of stream) {
		chunks.push(chunk);
	}

	return chunks;
};

describe("OllamaModelAdapter", () => {
	test("posts assistant tool calls and tool messages", async () => {
		const originalFetch = globalThis.fetch;
		let requestBody: unknown;

		globalThis.fetch = (async (_input: FetchInput, init?: FetchInit) => {
			requestBody = JSON.parse(String(init?.body));

			return new Response('{"message":{"content":"Done"},"done":true}\n');
		}) as unknown as typeof fetch;

		try {
			const adapter = new OllamaModelAdapter();

			await collectStream(
				adapter.streamChat({
					messages: [
						{
							role: "assistant",
							content: "",
							toolCalls: [
								{
									id: asToolCallId("tool-call-1"),
									name: "read_file",
									arguments: { path: "README.md" },
								},
							],
						},
						{
							role: "tool",
							toolCallId: asToolCallId("tool-call-1"),
							toolName: "read_file",
							content: "{\"content\":\"hello\"}",
						},
					],
				}),
			);

			expect(requestBody).toEqual({
				model: "gemma4:12b-it-qat",
				messages: [
					{
						role: "assistant",
						content: "",
						tool_calls: [
							{
								function: {
									name: "read_file",
									arguments: { path: "README.md" },
								},
							},
						],
					},
					{
						role: "tool",
						content: "{\"content\":\"hello\"}",
						tool_name: "read_file",
					},
				],
				stream: true,
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("posts chat messages and yields content deltas", async () => {
		const originalFetch = globalThis.fetch;
		let requestUrl = "";
		let requestBody: unknown;

		globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
			requestUrl = String(input);
			requestBody = JSON.parse(String(init?.body));

			return new Response(
				'{"message":{"content":"Hello"},"done":false}\n{"message":{"content":" there"},"done":false}\n{"done":true}\n',
				{ status: 200 },
			);
			}) as unknown as typeof fetch;

		try {
			const adapter = new OllamaModelAdapter(
				"http://localhost:11434/",
				" test-model ",
			);

			const chunks = await collectStream(
				adapter.streamChat({
					messages: [
						{
							role: "system",
							content: "System prompt",
						},
						{
							id: asMessageId("message-1"),
							role: "user",
							content: "Hello",
						},
					],
				}),
			);

			expect(requestUrl).toBe("http://localhost:11434/api/chat");
			expect(requestBody).toEqual({
				model: "test-model",
				messages: [
					{
						role: "system",
						content: "System prompt",
					},
					{
						role: "user",
						content: "Hello",
					},
				],
				stream: true,
			});
			expect(chunks).toEqual([
				{ contentDelta: "Hello" },
				{ contentDelta: " there" },
			]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("streams tool calls when tools are provided", async () => {
		const originalFetch = globalThis.fetch;
		let requestBody: unknown;

		globalThis.fetch = (async (_input: FetchInput, init?: FetchInit) => {
			requestBody = JSON.parse(String(init?.body));

			return new Response(
				'{"message":{"content":"","tool_calls":[{"function":{"name":"read_file","arguments":{"path":"README.md"}}}]},"done":true}\n',
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		try {
			const adapter = new OllamaModelAdapter();
			const tool = {
				name: "read_file",
				description: "Read a file",
				parameters: {
					type: "object",
					required: ["path"],
					properties: {
						path: { type: "string" },
					},
				},
			};

			const chunks = await collectStream(
				adapter.streamChat({
					messages: [],
					tools: [tool],
				}),
			);

			expect(requestBody).toEqual({
				model: "gemma4:12b-it-qat",
				messages: [],
				tools: [
					{
						type: "function",
						function: {
							name: tool.name,
							description: tool.description,
							parameters: tool.parameters,
						},
					},
				],
				stream: true,
			});
			expect(chunks).toEqual([
				{
					contentDelta: "",
					toolCalls: [
						{
							name: "read_file",
							arguments: { path: "README.md" },
						},
					],
				},
			]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("throws a bounded error for non-ok responses", async () => {
		const originalFetch = globalThis.fetch;

		globalThis.fetch = (async () => {
			return new Response("model not found", { status: 404 });
			}) as unknown as typeof fetch;

		try {
			const adapter = new OllamaModelAdapter();

			await expect(
				collectStream(adapter.streamChat({ messages: [] })),
			).rejects.toThrow("Ollama request failed with status 404");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("throws when the stream contains malformed JSON", async () => {
		const originalFetch = globalThis.fetch;
		let wasCancelled = false;

		globalThis.fetch = (async () => {
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("not-json\n"));
					},
					cancel() {
						wasCancelled = true;
					},
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		try {
			const adapter = new OllamaModelAdapter();

			await expect(
				collectStream(adapter.streamChat({ messages: [] })),
			).rejects.toThrow("Invalid Ollama stream JSON");
			expect(wasCancelled).toBe(true);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("throws when Ollama streams an error event", async () => {
		const originalFetch = globalThis.fetch;

		globalThis.fetch = (async () => {
			return new Response('{"error":"model failed"}\n', { status: 200 });
			}) as unknown as typeof fetch;

		try {
			const adapter = new OllamaModelAdapter();

			await expect(
				collectStream(adapter.streamChat({ messages: [] })),
			).rejects.toThrow("Ollama stream failed: model failed");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("rejects empty configuration values", () => {
		expect(() => new OllamaModelAdapter(" ", "model")).toThrow(
			"Ollama base URL cannot be empty.",
		);
		expect(() => new OllamaModelAdapter("http://localhost:11434", " ")).toThrow(
			"Ollama model name cannot be empty.",
		);
	});
});
