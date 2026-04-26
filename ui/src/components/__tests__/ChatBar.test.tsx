// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ChatBar } from "../ChatBar";

const sendMock = vi.fn();
vi.mock("../../api/company-chat", () => ({
  companyChatApi: {
    send: (...args: unknown[]) => sendMock(...args),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  sendMock.mockReset();
});

function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(MemoryRouter, null, node),
      ),
    );
  });
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

describe("<ChatBar />", () => {
  it("renders an input and a Send button", () => {
    const { container, unmount } = mount(createElement(ChatBar, { companyId: "co-1" }));
    expect(container.querySelector("input")).toBeTruthy();
    const button = container.querySelector("button");
    expect(button?.textContent).toContain("Send");
    unmount();
  });

  it("disables Send when input is empty", () => {
    const { container, unmount } = mount(createElement(ChatBar, { companyId: "co-1" }));
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    unmount();
  });

  it("calls companyChatApi.send when Send is clicked with non-empty input", async () => {
    sendMock.mockResolvedValue({ issueId: "i-1", identifier: "PAP-1", coordinatorId: "c-1" });
    const { container, unmount } = mount(createElement(ChatBar, { companyId: "co-1" }));
    const input = container.querySelector("input") as HTMLInputElement;
    const button = container.querySelector("button") as HTMLButtonElement;

    // Use the native input value setter to bypass React's synthetic event guard
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      nativeInputValueSetter?.call(input, "hi");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      button.click();
    });
    expect(sendMock).toHaveBeenCalledWith("co-1", { message: "hi" });
    unmount();
  });
});
