import type { UnloadModelInput } from './ModelPort';

export interface ModelActivationPort {
	/** Confirm the provider can activate the model without generating an answer. */
	activate(input?: UnloadModelInput): Promise<void>;
}
