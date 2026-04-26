/**
 * Composition factory for the Reflector subsystem (M2 G3 §4 — refactored).
 *
 * Returns null when `config.reflectorEnabled === false`. When enabled,
 * builds a Reflector backed by NotesManager (per-call) and an
 * EmbeddingService driven by the LLMRouter.
 *
 * Both the reflection builder LLM and the embedder come from the
 * same LLMRouter:
 *   - router.getTextTransport("reflector") → HaikuReflectionBuilder when
 *     non-null, TemplatedReflectionBuilder fallback when null
 *   - router.getEmbeddingTransport() → real EmbeddingService when
 *     non-null, SHA-256 stub fallback when null
 *
 * The GitStore is initialized once at factory construction so subsequent
 * NotesManager.create calls are cheap.
 */

import {
  Reflector,
  HaikuReflectionBuilder,
  type NotesSink,
  type ReflectionBuilder,
} from "@petagent/reflector";
import { NotesManager } from "@petagent/skills";
import { GitStore } from "@petagent/safety-net";
import type { HookBus } from "@petagent/hooks";
import type { Db } from "@petagent/db";
import { DrizzleBehavioralRecordsStore } from "../psychologist/drizzle_behavioral_store.js";
import { DrizzleReflectionContextSource } from "../reflector/drizzle_context_source.js";
import { createEmbeddingService } from "./embedding.js";
import type { Config } from "../config.js";
import type { LLMRouter } from "./llm-router.js";

export interface ReflectorFactoryDeps {
  db: Db;
  hookBus: HookBus;
  config: Pick<Config, "reflectorEnabled" | "notesGitStoreDir">;
  router: LLMRouter;
  logger?: { warn(msg: string, meta?: unknown): void };
}

export interface ReflectorInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  builderKind: "templated" | "haiku";
}

export async function createReflector(deps: ReflectorFactoryDeps): Promise<ReflectorInstance | null> {
  if (!deps.config.reflectorEnabled) return null;

  const store = new GitStore({ rootDir: deps.config.notesGitStoreDir });
  await store.init();
  const embedder = createEmbeddingService({ router: deps.router }).service;

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

  const route = deps.router.getTextTransport("reflector");
  let builder: ReflectionBuilder | undefined;
  let builderKind: "templated" | "haiku" = "templated";
  if (route !== null) {
    builder = new HaikuReflectionBuilder({
      transport: route.transport,
      model: route.model,
    });
    builderKind = "haiku";
  }

  const records = new DrizzleBehavioralRecordsStore(deps.db);
  const contextSource = new DrizzleReflectionContextSource({
    db: deps.db,
    records,
  });

  const reflector = new Reflector({
    bus: deps.hookBus,
    notesSink: sink,
    builder,
    contextSource,
    logger: deps.logger,
  });

  return {
    start: () => reflector.start(),
    stop: () => reflector.stop(),
    builderKind,
  };
}
