// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notes } from "../Notes";

const listMock = vi.hoisted(() => vi.fn());
const searchMock = vi.hoisted(() => vi.fn());
const agentsListMock = vi.hoisted(() => vi.fn());

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "co-1" }),
}));

vi.mock("@/context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("@/api/agent-notes", () => ({
  agentNotesApi: {
    list: (...args: unknown[]) => listMock(...args),
    search: (...args: unknown[]) => searchMock(...args),
  },
}));

vi.mock("@/api/agents", () => ({
  agentsApi: {
    list: (...args: unknown[]) => agentsListMock(...args),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("<Notes />", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    listMock.mockReset();
    searchMock.mockReset();
    agentsListMock.mockReset();
    agentsListMock.mockResolvedValue([{ id: "a-1", name: "Alice" }]);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("lists recent notes from the list endpoint when query is empty", async () => {
    listMock.mockResolvedValue([
      {
        id: "n1",
        agentId: "a-1",
        companyId: "co-1",
        scope: "project",
        noteType: "lesson",
        content: "vercel auth via --token",
        createdAt: new Date().toISOString(),
      },
    ]);

    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Notes />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    expect(container.textContent).toMatch(/vercel auth/i);
    expect(listMock).toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();

    await act(async () => { root.unmount(); });
  });

  it("switches to the search endpoint when the user submits a query", async () => {
    listMock.mockResolvedValue([]);
    searchMock.mockResolvedValue([]);

    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Notes />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    expect(listMock).toHaveBeenCalled();

    const input = container.querySelector<HTMLInputElement>("input[placeholder*='Search']") ??
      container.querySelector<HTMLInputElement>("input[placeholder*='search']");
    expect(input).toBeTruthy();

    // React tracks input value via a custom property on the DOM node.
    // To trigger onChange reliably in jsdom we must use Object.getOwnPropertyDescriptor
    // on the native input prototype to bypass React's value setter guard.
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      nativeInputValueSetter?.call(input!, "vercel");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => /search/i.test(b.textContent ?? ""),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
    await flushReact();

    expect(searchMock).toHaveBeenCalled();
    const lastArgs = searchMock.mock.calls.at(-1)?.[0] as { query: string };
    expect(lastArgs.query).toBe("vercel");

    await act(async () => { root.unmount(); });
  });

  it("includes scope filter in list args", async () => {
    listMock.mockResolvedValue([]);

    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Notes />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    expect(listMock).toHaveBeenCalled();

    const scopeSelect = container.querySelector<HTMLSelectElement>("select[aria-label='Scope']") ??
      Array.from(container.querySelectorAll("select")).find(
        (s) => s.getAttribute("aria-label")?.match(/scope/i),
      );
    expect(scopeSelect).toBeTruthy();

    await act(async () => {
      scopeSelect!.value = "user";
      scopeSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flushReact();
    await flushReact();

    const calls = listMock.mock.calls.map((c) => (c[0] as { scope?: string }).scope);
    expect(calls.some((s) => s === "user")).toBe(true);

    await act(async () => { root.unmount(); });
  });
});
