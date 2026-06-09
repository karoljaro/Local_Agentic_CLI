import { describe, expect, test } from "bun:test";

import { createInitialAgentState } from "@/domain/AgentState";
import { asMessageId, asSessionId, asToolCallId } from "@/domain/Ids";

import { ContextBuilder } from "./ContextBuilder";

describe("ContextBuilder", () => {
	test("builds context with a system prompt for an empty state", () => {
		const state = createInitialAgentState(asSessionId("session-1"));
		const builder = new ContextBuilder({
			systemPrompt: "You are a local coding agent.",
		});

		const context = builder.build(state);

		expect(context.messages).toEqual([
			{
				role: "system",
				content: "You are a local coding agent.",
			},
		]);
	});

	test("preserves session messages after the system prompt", () => {
		const state = createInitialAgentState(asSessionId("session-1"));
		const toolCallId = asToolCallId("tool-call-1");

		state.messages.push(
			{
				id: asMessageId("message-1"),
				role: "user",
				content: "Read README",
			},
			{
				id: asMessageId("message-2"),
				role: "assistant",
				content: "I will read it.",
			},
			{
				role: "tool",
				toolCallId,
				toolName: "read_file",
				content: "README content",
			},
		);

		const builder = new ContextBuilder({
			systemPrompt: "You are a local coding agent.",
		});

		const context = builder.build(state);

		expect(context.messages).toEqual([
			{
				role: "system",
				content: "You are a local coding agent.",
			},
			{
				id: asMessageId("message-1"),
				role: "user",
				content: "Read README",
			},
			{
				id: asMessageId("message-2"),
				role: "assistant",
				content: "I will read it.",
			},
			{
				role: "tool",
				toolCallId,
				toolName: "read_file",
				content: "README content",
			},
		]);
	});
});
