export const DEFAULT_AGENT_NOTE_EMBEDDING_DIMS = 1536;
export const MAX_AGENT_NOTE_EMBEDDING_DIMS = 16_000;

export function resolveAgentNoteEmbeddingDims(
  env: { [key: string]: string | undefined } = process.env,
): number {
  const raw = env.PETAGENT_EMBEDDING_DIMS?.trim();
  if (!raw) return DEFAULT_AGENT_NOTE_EMBEDDING_DIMS;

  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `Invalid PETAGENT_EMBEDDING_DIMS '${raw}'. Expected a positive integer.`,
    );
  }

  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_AGENT_NOTE_EMBEDDING_DIMS
  ) {
    throw new Error(
      `Invalid PETAGENT_EMBEDDING_DIMS '${raw}'. Expected an integer from 1 to ${MAX_AGENT_NOTE_EMBEDDING_DIMS}.`,
    );
  }

  return value;
}
