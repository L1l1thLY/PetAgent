/**
 * Project memory git-sync routine (M2 G4 Phase J).
 *
 * Periodically pushes the GitStore (notes + skills) to a configured
 * remote. v1 ships with a single global remote per server (configured
 * via env). Per-company remote URLs land in the next sub-phase
 * (Company Settings → Memory Sync).
 *
 * Failure handling: a push that fails (auth issue, network down,
 * non-fast-forward) doesn't stop the routine — it logs + records
 * the error in lastResult so callers can surface it. Next cycle
 * retries.
 */

import { GitStore, type PushAuth, type PushResult } from "@petagent/safety-net";

export interface GitSyncRoutineOptions {
  /** GitStore root — same dir the Reflector uses. */
  storeDir: string;
  remoteUrl: string;
  remoteName?: string;
  ref?: string;
  auth?: PushAuth;
  intervalMs?: number;
  logger?: { info?(msg: string): void; warn?(msg: string, meta?: unknown): void };
}

export interface RunningGitSyncRoutine {
  stop(): void;
  pushNow(): Promise<PushResult>;
  lastResult(): PushResult | null;
}

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REMOTE_NAME = "origin";
const DEFAULT_REF = "main";

export function startGitSyncRoutine(opts: GitSyncRoutineOptions): RunningGitSyncRoutine {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const remoteName = opts.remoteName ?? DEFAULT_REMOTE_NAME;
  const ref = opts.ref ?? DEFAULT_REF;
  const store = new GitStore({ rootDir: opts.storeDir });
  let last: PushResult | null = null;
  let initPromise: Promise<void> | null = null;

  async function ensureInit(): Promise<void> {
    if (initPromise === null) {
      initPromise = (async () => {
        await store.init();
        await store.setRemote(remoteName, opts.remoteUrl);
      })();
    }
    return initPromise;
  }

  async function pushNow(): Promise<PushResult> {
    try {
      await ensureInit();
      const result = await store.push({
        remoteName,
        ref,
        auth: opts.auth,
      });
      last = result;
      if (result.ok) {
        opts.logger?.info?.(
          `[git-sync] pushed ${ref} → ${remoteName} (${result.pushedHeadSha?.slice(0, 7) ?? "?"})`,
        );
      } else {
        opts.logger?.warn?.(`[git-sync] push failed: ${result.error}`);
      }
      return result;
    } catch (err) {
      const fallback: PushResult = {
        remote: remoteName,
        ref,
        ok: false,
        pushedHeadSha: null,
        error: err instanceof Error ? err.message : String(err),
      };
      last = fallback;
      opts.logger?.warn?.(`[git-sync] push threw: ${fallback.error}`);
      return fallback;
    }
  }

  const handle = setInterval(() => {
    void pushNow();
  }, intervalMs);
  setTimeout(() => void pushNow(), 60_000).unref();

  return {
    stop: () => clearInterval(handle),
    pushNow,
    lastResult: () => last,
  };
}
