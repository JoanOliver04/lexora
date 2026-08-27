"use client";

import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";

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
    <fieldset className="flex flex-col gap-1 border-0 p-0 text-xs">
      <legend className="p-0 text-(--color-ink-subtle)">{t("label")}</legend>
      <div className="mt-1 flex gap-1" role="radiogroup" aria-label={t("label")}>
        {themePreferences.map((option: ThemePreference) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={preference === option}
            onClick={() => setPreference(option)}
            className={`rounded-(--radius-control) border px-2 py-1 transition-colors duration-(--duration-quick) ${
              preference === option
                ? "border-(--color-accent) text-(--color-accent)"
                : "border-(--color-border) text-(--color-ink-muted)"
            }`}
          >
            {t(option)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
