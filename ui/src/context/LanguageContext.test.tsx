// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider, useLanguage } from "./LanguageContext";
import { LANGUAGE_STORAGE_KEY } from "../i18n/types";
import "../i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("LanguageContext", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.localStorage.clear();
  });

  it("exposes the current language and lets consumers change it", () => {
    let captured: { language: string; setLanguage: (l: "en" | "zh") => void } | null = null;

    function Probe() {
      captured = useLanguage();
      return null;
    }

    act(() => {
      root.render(
        <LanguageProvider>
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(captured!.language).toMatch(/^(en|zh)$/);

    act(() => {
      captured!.setLanguage("zh");
    });

    expect(captured!.language).toBe("zh");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");

    act(() => {
      captured!.setLanguage("en");
    });

    expect(captured!.language).toBe("en");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("ignores unknown stored values when reading initial state", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "xx");

    let captured: { language: string } | null = null;
    function Probe() {
      captured = useLanguage();
      return null;
    }

    act(() => {
      root.render(
        <LanguageProvider>
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(captured!.language).toMatch(/^(en|zh)$/);
  });

  it("throws when useLanguage is called outside a provider", () => {
    function ThrowingProbe() {
      useLanguage();
      return null;
    }

    expect(() => {
      act(() => {
        root.render(<ThrowingProbe />);
      });
    }).toThrow(/LanguageProvider/);
  });
});
