import type { AgentState } from '@/domain/AgentState';
import type { ModelMessage } from '@/domain/ModelMessage';

type ContextBuilderOptions = {
	systemPrompt: string;
};

type BuildContextResult = {
	messages: ModelMessage[];
};

export class ContextBuilder {
	constructor(private readonly options: ContextBuilderOptions) {}

	build(state: AgentState): BuildContextResult {
		return {
			messages: [
				{
					role: 'system',
					content: this.options.systemPrompt,
				},
				...state.messages,
			],
		};
	}
}
