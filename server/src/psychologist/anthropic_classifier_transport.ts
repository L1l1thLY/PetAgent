/**
 * Backwards-compat re-export shim. The actual transport now lives in
 * @petagent/llm-providers as `AnthropicMessagesTransport` (M2 G3 §1).
 * This file preserves the legacy `AnthropicHttpClassifierTransport`
 * name + extractFirstText export for existing tests and callers.
 */

import type { ClassifierTransport } from "@petagent/psychologist";
import {
  AnthropicMessagesTransport,
  type AnthropicMessagesTransportOptions,
} from "@petagent/llm-providers";

export type AnthropicHttpClassifierTransportOptions = AnthropicMessagesTransportOptions;

// Re-export under legacy name. AnthropicMessagesTransport implements
// LLMTextTransport which is structurally identical to ClassifierTransport.
export class AnthropicHttpClassifierTransport
  extends AnthropicMessagesTransport
  implements ClassifierTransport {}

export { extractFirstAnthropicText as extractFirstText } from "@petagent/llm-providers";
