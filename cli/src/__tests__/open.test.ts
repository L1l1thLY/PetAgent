import { describe, expect, it, vi } from "vitest";
import { DEFAULT_UI_URL, openBoard, resolveOpenCommand } from "../commands/open.js";

describe("resolveOpenCommand", () => {
  it("uses `open` on macOS", () => {
    expect(resolveOpenCommand("darwin")).toEqual({ command: "open", baseArgs: [] });
  });

  it("uses `xdg-open` on Linux", () => {
    expect(resolveOpenCommand("linux")).toEqual({ command: "xdg-open", baseArgs: [] });
  });

  it("uses `cmd /c start` on Windows", () => {
    expect(resolveOpenCommand("win32")).toEqual({ command: "cmd", baseArgs: ["/c", "start", ""] });
  });
});

describe("openBoard", () => {
  function makeFakeChild() {
    const handlers = new Map<string, (err?: Error) => void>();
    return {
      on: vi.fn((event: string, handler: (err?: Error) => void) => {
        handlers.set(event, handler);
      }),
      unref: vi.fn(),
      handlers,
    };
  }

  it("opens the default URL on darwin", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child as never);
    const lines: string[] = [];
    const resultPromise = openBoard(
      {},
      {
        platform: "darwin",
        env: {},
        spawn: spawnFn as never,
        stdout: (line) => lines.push(line),
      },
    );
    child.handlers.get("spawn")?.();
    const code = await resultPromise;
    expect(code).toBe(0);
    expect(spawnFn).toHaveBeenCalledWith("open", [DEFAULT_UI_URL], expect.any(Object));
    expect(lines[0]).toContain(DEFAULT_UI_URL);
    expect(child.unref).toHaveBeenCalled();
  });

  it("honors PETAGENT_UI_URL env override", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child as never);
    const resultPromise = openBoard(
      {},
      {
        platform: "linux",
        env: { PETAGENT_UI_URL: "https://petagent.internal/board" },
        spawn: spawnFn as never,
        stdout: () => {},
      },
    );
    child.handlers.get("spawn")?.();
    await resultPromise;
    expect(spawnFn).toHaveBeenCalledWith(
      "xdg-open",
      ["https://petagent.internal/board"],
      expect.any(Object),
    );
  });

  it("--url overrides env", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child as never);
    const resultPromise = openBoard(
      { url: "http://explicit/board" },
      {
        platform: "win32",
        env: { PETAGENT_UI_URL: "http://env/board" },
        spawn: spawnFn as never,
        stdout: () => {},
      },
    );
    child.handlers.get("spawn")?.();
    await resultPromise;
    expect(spawnFn).toHaveBeenCalledWith(
      "cmd",
      ["/c", "start", "", "http://explicit/board"],
      expect.any(Object),
    );
  });

  it("returns non-zero and prints hint when spawn errors", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child as never);
    const errs: string[] = [];
    const resultPromise = openBoard(
      {},
      {
        platform: "linux",
        env: {},
        spawn: spawnFn as never,
        stdout: () => {},
        stderr: (line) => errs.push(line),
      },
    );
    child.handlers.get("error")?.(new Error("ENOENT"));
    const code = await resultPromise;
    expect(code).toBe(1);
    expect(errs.join("\n")).toContain("Failed to launch xdg-open");
    expect(errs.join("\n")).toContain("petagent serve");
  });
});
