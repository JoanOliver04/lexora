"use client";
import { useLayoutEffect } from "react";
import type { ThemePreference } from "./theme";
import { resolveTheme, setPreference } from "./theme-store";

/** The persisted account preference wins when entering or refreshing the private area. */
export function AccountTheme({ preference }: { preference: ThemePreference }) {
  useLayoutEffect(() => {
    setPreference(preference);
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => {
      document.documentElement.dataset["theme"] = resolveTheme("system");
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [preference]);
  return null;
}
