import { EventEmitter } from "node:events";
import type { RoleTemplateLoader } from "./loader.js";

/**
 * Events from a WatcherSource are a normalized subset of the underlying
 * file-system watcher: add / change / unlink. Sources are injected so
 * tests don't need a real filesystem watcher.
 */
export interface WatcherChange {
  type: "add" | "change" | "unlink";
  path: string;
}

export interface WatcherSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(listener: (change: WatcherChange) => void): () => void;
}

export interface WatcherEmission {
  changes: WatcherChange[];
  reloadedAt: Date;
}

export interface RoleTemplateWatcherOptions {
  loader: RoleTemplateLoader;
  sources: WatcherSource[];
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 150;

/**
 * Watches one or more WatcherSources for .md changes and, after a short
 * debounce, asks the RoleTemplateLoader to rescan its directories. Emits
 * a "reloaded" event with the accumulated batch of filesystem changes.
 *
 * Per spec §20, in-flight sessions are NOT hot-swapped — callers should
 * let existing sessions finish with the old role definition; new
 * sessions pick up the reloaded template on next start.
 */
export class RoleTemplateWatcher {
  private readonly loader: RoleTemplateLoader;
  private readonly sources: WatcherSource[];
  private readonly debounceMs: number;
  private readonly emitter = new EventEmitter();
  private readonly unsubscribes: Array<() => void> = [];
  private pending: WatcherChange[] = [];
  private pendingTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(opts: RoleTemplateWatcherOptions) {
    this.loader = opts.loader;
    this.sources = opts.sources;
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const source of this.sources) {
      await source.start();
      const unsub = source.on((change) => this.onChange(change));
      this.unsubscribes.push(unsub);
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
      this.pending = [];
    }
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes.length = 0;
    for (const source of this.sources) await source.stop();
  }

  /** Subscribe to batched reload emissions. Returns unsubscribe. */
  onReloaded(listener: (event: WatcherEmission) => void): () => void {
    this.emitter.on("reloaded", listener);
    return () => this.emitter.off("reloaded", listener);
  }

  /** Manually trigger a flush (bypasses the debounce). Exported for tests and for explicit "reload now" API calls. */
  async flush(): Promise<void> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    const changes = this.pending;
    this.pending = [];
    await this.performReload(changes);
  }

  private onChange(change: WatcherChange): void {
    if (!isMarkdown(change.path)) return;
    this.pending.push(change);
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      const changes = this.pending;
      this.pending = [];
      this.pendingTimer = null;
      void this.performReload(changes);
    }, this.debounceMs);
  }

  private async performReload(changes: WatcherChange[]): Promise<void> {
    try {
      await this.loader.reload();
      this.emitter.emit("reloaded", {
        changes,
        reloadedAt: new Date(),
      } satisfies WatcherEmission);
    } catch (err) {
      console.error("[role-template:watcher] reload failed:", err);
    }
  }
}

function isMarkdown(p: string): boolean {
  return p.toLowerCase().endsWith(".md");
}

/**
 * Construct a chokidar-backed WatcherSource over a directory tree. Import
 * is dynamic so consumers that only need the abstract source (e.g. tests)
 * don't pull chokidar in.
 */
export async function createChokidarSource(
  rootDir: string,
  opts: { usePolling?: boolean; awaitWriteFinishMs?: number } = {},
): Promise<WatcherSource> {
  const chokidarModule = (await import("chokidar")) as unknown as {
    watch: (paths: string | string[], options?: unknown) => {
      on(event: string, listener: (p: string) => void): unknown;
      close(): Promise<void>;
    };
    default?: {
      watch: (paths: string | string[], options?: unknown) => {
        on(event: string, listener: (p: string) => void): unknown;
        close(): Promise<void>;
      };
    };
  };
  const chokidar = chokidarModule.default ?? chokidarModule;
  let watcher: ReturnType<typeof chokidar.watch> | null = null;
  const listeners = new Set<(c: WatcherChange) => void>();
  return {
    async start() {
      watcher = chokidar.watch(rootDir, {
        ignoreInitial: true,
        persistent: true,
        usePolling: opts.usePolling ?? false,
        awaitWriteFinish: opts.awaitWriteFinishMs
          ? { stabilityThreshold: opts.awaitWriteFinishMs, pollInterval: 50 }
          : undefined,
      });
      watcher.on("add", (p: string) => emit({ type: "add", path: p }));
      watcher.on("change", (p: string) => emit({ type: "change", path: p }));
      watcher.on("unlink", (p: string) => emit({ type: "unlink", path: p }));
    },
    async stop() {
      if (watcher) {
        await watcher.close();
        watcher = null;
      }
      listeners.clear();
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  function emit(change: WatcherChange) {
    for (const l of listeners) l(change);
  }
}
