"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useSyncExternalStore } from "react";

import { themePreferences, type ThemePreference } from "./theme";
import {
  getServerSnapshot,
  getSnapshot,
  resolveTheme,
  setPreference,
  subscribe,
} from "./theme-store";

export function ThemeToggle() {
  const t = useTranslations("Theme");
  const name = useId();
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Si la preferencia es «seguir al sistema», hay que reaccionar cuando el
  // sistema cambia. Sin esto, alguien con cambio automatico al anochecer se
  // queda en el tema que hubiera cuando abrio la pestana.
  useEffect(() => {
    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.dataset["theme"] = resolveTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  return (
    <fieldset className="flex min-w-0 flex-col gap-1 border-0 p-0 text-sm">
      <legend className="p-0 text-(--color-ink-muted)">{t("label")}</legend>
      <div className="mt-1 flex flex-wrap gap-1">
        {themePreferences.map((option: ThemePreference) => (
          <label
            key={option}
            className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3 py-2 transition-colors duration-(--duration-quick) ${
              preference === option
                ? "border-(--color-accent) text-(--color-accent)"
                : "border-(--color-border-strong) text-(--color-ink-muted)"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={preference === option}
              onChange={() => setPreference(option)}
              className="h-4 w-4 shrink-0 accent-(--color-accent)"
            />
            {t(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
