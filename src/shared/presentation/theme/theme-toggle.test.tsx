// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en.json";
import { ThemeToggle } from "./theme-toggle";
import { setPreference } from "./theme-store";
import { THEME_STORAGE_KEY } from "./theme";

const mediaListeners = new Set<() => void>();
const media = {
  matches: false,
  addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
  removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
};
beforeEach(() => {
  media.matches = false;
  mediaListeners.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  localStorage.clear();
  setPreference("system");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const view = () => (
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <ThemeToggle />
  </NextIntlClientProvider>
);
describe("Native theme controls with restricted storage", () => {
  it("keeps Dark → System coherent when reading and writing storage throw, and follows the OS", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    render(view());
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(document.documentElement.dataset["theme"]).toBe("light");
    act(() => {
      media.matches = true;
      for (const listener of mediaListeners) listener();
    });
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    act(() => {
      media.matches = false;
      for (const listener of mediaListeners) listener();
    });
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });
  it("does not let a readable stale value undo a failed write", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    render(view());
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });
  it("adopts a shared preference and storage clearing from another tab", () => {
    render(view());
    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }),
      );
    });
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });
});
