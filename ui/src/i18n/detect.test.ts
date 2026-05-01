import { describe, expect, it } from "vitest";
import { detectInitialLanguage } from "./detect";

function makeStorage(initial: Record<string, string> = {}, opts: { throws?: boolean } = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => {
      if (opts.throws) throw new Error("storage unavailable");
      return data.has(key) ? data.get(key)! : null;
    },
    key: (n) => Array.from(data.keys())[n] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      if (opts.throws) throw new Error("storage unavailable");
      data.set(key, value);
    },
  } as Storage;
}

describe("detectInitialLanguage", () => {
  it("returns stored language when set to 'en'", () => {
    const storage = makeStorage({ "petagent.language": "en" });
    expect(detectInitialLanguage({ language: "zh-CN" }, storage)).toBe("en");
  });

  it("returns stored language when set to 'zh'", () => {
    const storage = makeStorage({ "petagent.language": "zh" });
    expect(detectInitialLanguage({ language: "en-US" }, storage)).toBe("zh");
  });

  it("ignores unknown stored values and falls through to navigator", () => {
    const storage = makeStorage({ "petagent.language": "fr" });
    expect(detectInitialLanguage({ language: "zh-TW" }, storage)).toBe("zh");
  });

  it("returns 'zh' for navigator.language = 'zh-CN'", () => {
    expect(detectInitialLanguage({ language: "zh-CN" }, makeStorage())).toBe("zh");
  });

  it("returns 'zh' for navigator.language = 'zh-TW'", () => {
    expect(detectInitialLanguage({ language: "zh-TW" }, makeStorage())).toBe("zh");
  });

  it("returns 'zh' for navigator.language = 'zh-HK'", () => {
    expect(detectInitialLanguage({ language: "zh-HK" }, makeStorage())).toBe("zh");
  });

  it("returns 'zh' when navigator.languages contains zh, even if .language does not", () => {
    expect(
      detectInitialLanguage({ language: "en-US", languages: ["en-US", "zh-CN"] }, makeStorage()),
    ).toBe("zh");
  });

  it("returns 'en' for navigator.language = 'en-US'", () => {
    expect(detectInitialLanguage({ language: "en-US" }, makeStorage())).toBe("en");
  });

  it("returns 'en' for navigator.language = 'fr-FR'", () => {
    expect(detectInitialLanguage({ language: "fr-FR" }, makeStorage())).toBe("en");
  });

  it("returns 'en' when navigator is null", () => {
    expect(detectInitialLanguage(null, makeStorage())).toBe("en");
  });

  it("returns 'en' when storage throws (private mode)", () => {
    const storage = makeStorage({}, { throws: true });
    expect(detectInitialLanguage({ language: "en-US" }, storage)).toBe("en");
  });

  it("still falls through to navigator when storage throws and navigator is zh", () => {
    const storage = makeStorage({}, { throws: true });
    expect(detectInitialLanguage({ language: "zh-CN" }, storage)).toBe("zh");
  });

  it("returns 'en' when storage is null entirely", () => {
    expect(detectInitialLanguage({ language: "en" }, null)).toBe("en");
  });
});
