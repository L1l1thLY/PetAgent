import { describe, it, expect, vi } from "vitest";
import { RoleTemplateLoader } from "./loader.js";
import { RoleTemplateWatcher, type WatcherSource, type WatcherChange } from "./watcher.js";
import {
  bridgeRoleTemplateWatcherToHookBus,
  type RoleTemplateHookEvent,
} from "./hook_bridge.js";

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

describe("bridgeRoleTemplateWatcherToHookBus", () => {
  it("publishes role.template_changed with accumulated changes on each batched reload", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir: "/tmp/nox-b",
    });
    await loader.loadAll();
    const { source, emit } = fakeSource();
    const watcher = new RoleTemplateWatcher({
      loader,
      sources: [source],
      debounceMs: 0,
    });
    await watcher.start();

    const published: RoleTemplateHookEvent[] = [];
    const unsub = bridgeRoleTemplateWatcherToHookBus({
      watcher,
      companyId: "*",
      publish: async (e) => {
        published.push(e);
      },
    });

    emit({ type: "add", path: "/tmp/x/role-a.md" });
    emit({ type: "change", path: "/tmp/x/role-a.md" });
    await watcher.flush();

    expect(published).toHaveLength(1);
    expect(published[0].type).toBe("role.template_changed");
    expect(published[0].companyId).toBe("*");
    const payloadChanges = published[0].payload.changes as WatcherChange[];
    expect(payloadChanges).toHaveLength(2);
    expect(payloadChanges[0]).toMatchObject({ type: "add", path: "/tmp/x/role-a.md" });

    unsub();
    await watcher.stop();
  });

  it("unsubscribe stops further publishes but doesn't stop the watcher", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir: "/tmp/nox-b",
    });
    await loader.loadAll();
    const { source, emit } = fakeSource();
    const watcher = new RoleTemplateWatcher({
      loader,
      sources: [source],
      debounceMs: 0,
    });
    await watcher.start();

    const publish = vi.fn().mockResolvedValue(undefined);
    const unsub = bridgeRoleTemplateWatcherToHookBus({
      watcher,
      companyId: "*",
      publish,
    });

    emit({ type: "add", path: "/tmp/a.md" });
    await watcher.flush();
    expect(publish).toHaveBeenCalledTimes(1);

    unsub();
    emit({ type: "change", path: "/tmp/a.md" });
    await watcher.flush();
    expect(publish).toHaveBeenCalledTimes(1);

    await watcher.stop();
  });

  it("publish errors are logged and do not propagate", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir: "/tmp/nox-b",
    });
    await loader.loadAll();
    const { source, emit } = fakeSource();
    const watcher = new RoleTemplateWatcher({
      loader,
      sources: [source],
      debounceMs: 0,
    });
    await watcher.start();

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const publish = vi.fn().mockRejectedValue(new Error("bus down"));
    bridgeRoleTemplateWatcherToHookBus({
      watcher,
      companyId: "*",
      publish,
    });

    emit({ type: "add", path: "/tmp/a.md" });
    await expect(watcher.flush()).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("[role-template:hook_bridge]"),
      expect.any(Error),
    );
    err.mockRestore();
    await watcher.stop();
  });

  it("timestamp is ISO-8601 on each event", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/nox-u",
      projectDir: "/tmp/nox-p",
      pluginDirs: [],
      builtInDir: "/tmp/nox-b",
    });
    await loader.loadAll();
    const { source, emit } = fakeSource();
    const watcher = new RoleTemplateWatcher({
      loader,
      sources: [source],
      debounceMs: 0,
    });
    await watcher.start();

    const published: RoleTemplateHookEvent[] = [];
    bridgeRoleTemplateWatcherToHookBus({
      watcher,
      companyId: "c1",
      publish: async (e) => {
        published.push(e);
      },
    });

    emit({ type: "add", path: "/tmp/r.md" });
    await watcher.flush();
    expect(published[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(() => new Date(published[0].timestamp)).not.toThrow();

    await watcher.stop();
  });
});
