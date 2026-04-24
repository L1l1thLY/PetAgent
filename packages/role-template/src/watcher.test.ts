import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RoleTemplateLoader } from "./loader.js";
import {
  RoleTemplateWatcher,
  createChokidarSource,
  type WatcherChange,
  type WatcherSource,
} from "./watcher.js";

async function mktmp(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function fakeSource() {
  const listeners = new Set<(c: WatcherChange) => void>();
  return {
    source: {
      async start() {},
      async stop() {},
      on(listener: (c: WatcherChange) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } satisfies WatcherSource,
    emit(change: WatcherChange) {
      for (const l of listeners) l(change);
    },
  };
}

describe("RoleTemplateLoader.reload / snapshot / get", () => {
  let builtInDir: string;

  beforeEach(async () => {
    builtInDir = await mktmp("role-loader-reload-");
  });
  afterEach(async () => {
    await fs.rm(builtInDir, { recursive: true, force: true });
  });

  it("snapshot() is empty before loadAll()", () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir,
    });
    expect(loader.snapshot()).toEqual([]);
    expect(loader.get("coordinator")).toBeUndefined();
  });

  it("reload() picks up a newly-added role file", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir,
    });
    await loader.loadAll();
    expect(loader.snapshot()).toEqual([]);

    await fs.writeFile(
      path.join(builtInDir, "coord.md"),
      "---\nroleType: coordinator\ndescription: c\n---\ncbody",
    );
    const reloaded = await loader.reload();
    expect(reloaded).toHaveLength(1);
    expect(loader.get("coordinator")?.template.description).toBe("c");
  });

  it("reload() reflects content changes in place", async () => {
    await fs.writeFile(
      path.join(builtInDir, "coord.md"),
      "---\nroleType: coordinator\ndescription: original\n---\nbody",
    );
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir,
    });
    await loader.loadAll();
    expect(loader.get("coordinator")?.template.description).toBe("original");

    await fs.writeFile(
      path.join(builtInDir, "coord.md"),
      "---\nroleType: coordinator\ndescription: updated\n---\nbody",
    );
    await loader.reload();
    expect(loader.get("coordinator")?.template.description).toBe("updated");
  });

  it("onLoaded() fires on both loadAll and reload", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir,
    });
    const events: string[] = [];
    const unsub = loader.onLoaded((e) => events.push(e.reason));
    await loader.loadAll();
    await loader.reload();
    unsub();
    await loader.reload(); // should not fire after unsub
    expect(events).toEqual(["initial", "reload"]);
  });

  it("watchedDirs() enumerates every configured source", () => {
    const loader = new RoleTemplateLoader({
      userDir: "/u",
      projectDir: "/p",
      pluginDirs: ["/x", "/y"],
      builtInDir: "/b",
    });
    expect(loader.watchedDirs()).toEqual(["/b", "/x", "/y", "/p", "/u"]);
  });
});

describe("RoleTemplateWatcher (injected source)", () => {
  let builtInDir: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    builtInDir = await mktmp("role-watcher-");
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(builtInDir, { recursive: true, force: true });
  });

  it("debounces multiple .md changes into a single reload", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir,
    });
    await loader.loadAll();
    const reloadSpy = vi.spyOn(loader, "reload");

    const { source, emit } = fakeSource();
    const watcher = new RoleTemplateWatcher({
      loader,
      sources: [source],
      debounceMs: 100,
    });
    await watcher.start();

    emit({ type: "add", path: path.join(builtInDir, "a.md") });
    emit({ type: "change", path: path.join(builtInDir, "a.md") });
    emit({ type: "add", path: path.join(builtInDir, "b.md") });

    expect(reloadSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    await watcher.stop();
  });

  it("emits a reloaded event with the batched changes", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir,
    });
    await loader.loadAll();

    const { source, emit } = fakeSource();
    const watcher = new RoleTemplateWatcher({
      loader,
      sources: [source],
      debounceMs: 50,
    });
    await watcher.start();

    const events: Array<{ changes: WatcherChange[] }> = [];
    watcher.onReloaded((e) => events.push({ changes: e.changes }));

    emit({ type: "add", path: path.join(builtInDir, "coord.md") });
    emit({ type: "change", path: path.join(builtInDir, "coord.md") });
    // flush() bypasses the debounce timer and awaits the reload, so the
    // listener has already fired by the time it returns.
    await watcher.flush();

    expect(events).toHaveLength(1);
    expect(events[0].changes).toHaveLength(2);
    expect(events[0].changes[0]).toEqual({
      type: "add",
      path: path.join(builtInDir, "coord.md"),
    });
    await watcher.stop();
  });

  it("filters out non-markdown paths", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir,
    });
    await loader.loadAll();
    const reloadSpy = vi.spyOn(loader, "reload");

    const { source, emit } = fakeSource();
    const watcher = new RoleTemplateWatcher({
      loader,
      sources: [source],
      debounceMs: 50,
    });
    await watcher.start();

    emit({ type: "add", path: path.join(builtInDir, "notes.txt") });
    emit({ type: "change", path: path.join(builtInDir, "README") });
    await vi.advanceTimersByTimeAsync(80);
    expect(reloadSpy).not.toHaveBeenCalled();
    await watcher.stop();
  });

  it("stop() clears the pending timer so no late reload fires", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir,
    });
    await loader.loadAll();
    const reloadSpy = vi.spyOn(loader, "reload");

    const { source, emit } = fakeSource();
    const watcher = new RoleTemplateWatcher({
      loader,
      sources: [source],
      debounceMs: 200,
    });
    await watcher.start();
    emit({ type: "change", path: path.join(builtInDir, "x.md") });
    await watcher.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("flush() performs an immediate reload regardless of the debounce window", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir,
    });
    await loader.loadAll();
    const reloadSpy = vi.spyOn(loader, "reload");

    const { source, emit } = fakeSource();
    const watcher = new RoleTemplateWatcher({
      loader,
      sources: [source],
      debounceMs: 10_000,
    });
    await watcher.start();
    emit({ type: "change", path: path.join(builtInDir, "x.md") });
    await watcher.flush();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    await watcher.stop();
  });
});

describe("createChokidarSource (smoke: factory is dynamically importable)", () => {
  it("returns a WatcherSource with start/stop/on", async () => {
    const dir = await mktmp("role-watcher-chokidar-smoke-");
    try {
      const source = await createChokidarSource(dir);
      expect(typeof source.start).toBe("function");
      expect(typeof source.stop).toBe("function");
      expect(typeof source.on).toBe("function");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
