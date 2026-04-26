/**
 * Backwards-compat re-export shim. The actual transport now lives in
 * @petagent/llm-providers as `AnthropicMessagesTransport` (M2 G3 §1).
 * This file preserves the legacy `AnthropicHttpReflectionTransport`
 * name + extractFirstText export for existing tests and callers.
 */

import {
  AnthropicMessagesTransport,
  type AnthropicMessagesTransportOptions,
} from "@petagent/llm-providers";

export type AnthropicHttpReflectionTransportOptions = AnthropicMessagesTransportOptions;

export class AnthropicHttpReflectionTransport extends AnthropicMessagesTransport {}

export {
  extractFirstAnthropicText as extractFirstText,
} from "@petagent/llm-providers";

export type { AnthropicMessagesResponse } from "@petagent/llm-providers";
