import type { Db } from "@petagent/db";
import { sql } from "drizzle-orm";

export interface EmbeddingDimensionValidationOptions {
  db: Db;
  configuredDims: number;
  providerDims: number | null;
  providerLabel?: string | null;
  logger?: { warn(message: string): void };
}

export async function readAgentNotesEmbeddingColumnDims(db: Db): Promise<number | null> {
  const result = await db.execute(sql`
    WITH target AS (
      SELECT to_regclass('agent_notes') AS oid
    )
    SELECT format_type(a.atttypid, a.atttypmod) AS "dataType"
    FROM target
    JOIN pg_attribute a ON a.attrelid = target.oid
    WHERE a.attname = 'embedding'
      AND NOT a.attisdropped
    LIMIT 1
  `);
  const rows = Array.isArray(result)
    ? (result as Array<{ dataType?: unknown }>)
    : ((result as { rows?: Array<{ dataType?: unknown }> }).rows ?? []);
  return parsePgVectorType(rows[0]?.dataType);
}

export function parsePgVectorType(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^vector\((\d+)\)$/i);
  if (!match) return null;
  const dims = Number(match[1]);
  return Number.isSafeInteger(dims) && dims > 0 ? dims : null;
}

export async function validateAgentNotesEmbeddingDimensions(
  opts: EmbeddingDimensionValidationOptions,
): Promise<void> {
  const logger = opts.logger ?? console;

  let actualDims: number | null;
  try {
    actualDims = await readAgentNotesEmbeddingColumnDims(opts.db);
  } catch (error) {
    logger.warn(
      `[petagent] WARN embedding dimension validation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  if (actualDims === null) return;

  if (actualDims !== opts.configuredDims) {
    logger.warn(
      `[petagent] WARN agent_notes.embedding current DB vector dimension is ${actualDims}, but PETAGENT_EMBEDDING_DIMS expects ${opts.configuredDims}. Set PETAGENT_EMBEDDING_DIMS=${opts.configuredDims} before schema generation, then run 'pnpm db:generate' and 'pnpm db:migrate' to create/apply a matching migration for a new DB, or keep PETAGENT_EMBEDDING_DIMS aligned with the existing column.`,
    );
  }

  if (opts.providerDims !== null && actualDims !== opts.providerDims) {
    const provider = opts.providerLabel ? ` (${opts.providerLabel})` : "";
    logger.warn(
      `[petagent] WARN embedding provider${provider} expects ${opts.providerDims} dimensions, but agent_notes.embedding current DB vector dimension is ${actualDims}. Set PETAGENT_EMBEDDING_DIMS=${opts.providerDims} before schema generation, then run 'pnpm db:generate' and 'pnpm db:migrate' to create/apply a matching migration for a new DB. Notes writes/search can fail until the provider and pgvector column dimensions match.`,
    );
  }
}
