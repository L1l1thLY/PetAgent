/**
 * Composition factory for the Reflector subsystem (M2 preview milestone).
 *
 * Returns null when `config.reflectorEnabled === false`. When enabled,
 * builds a Reflector backed by NotesManager (per-call) and an in-memory
 * EmbeddingService stub. The GitStore is initialized once at factory
 * construction time so subsequent NotesManager.create calls are cheap.
 */

import { Reflector, type NotesSink } from "@petagent/reflector";
import { EmbeddingService, NotesManager } from "@petagent/skills";
import { GitStore } from "@petagent/safety-net";
import type { HookBus } from "@petagent/hooks";
import type { Db } from "@petagent/db";
import type { Config } from "../config.js";

export interface ReflectorFactoryDeps {
  db: Db;
  hookBus: HookBus;
  config: Pick<Config, "reflectorEnabled" | "notesGitStoreDir">;
  logger?: { warn(msg: string, meta?: unknown): void };
}

export interface ReflectorInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createReflector(deps: ReflectorFactoryDeps): Promise<ReflectorInstance | null> {
  if (!deps.config.reflectorEnabled) return null;

  const store = new GitStore({ rootDir: deps.config.notesGitStoreDir });
  await store.init();
  const embedder = new EmbeddingService();

  const sink: NotesSink = {
    async create(args) {
      const mgr = new NotesManager({
        db: deps.db,
        embedder,
        store,
        companyId: args.companyId,
      });
      const note = await mgr.create({
        agentId: args.agentId,
        content: args.content,
        scope: args.scope,
        sourceIssueId: args.sourceIssueId,
        noteType: args.noteType,
      });
      return { id: note.id };
    },
  };

  const reflector = new Reflector({
    bus: deps.hookBus,
    notesSink: sink,
    logger: deps.logger,
  });

  return {
    start: () => reflector.start(),
    stop: () => reflector.stop(),
  };
}
