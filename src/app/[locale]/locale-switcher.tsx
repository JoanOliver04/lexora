"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Cambia el idioma **de la interfaz**, no el idioma que se estudia.
 *
 * Usa el `useRouter` de `@/i18n/navigation`, no el de `next/navigation`: el
 * primero conserva la ruta actual y solo cambia el prefijo de idioma.
 */
export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-(--color-ink-muted)">{t("label")}</span>
      <select
        className="min-h-11 w-full min-w-0 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-sm text-(--color-ink)"
        value={locale}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(() => {
            router.replace(pathname, { locale: next as (typeof routing.locales)[number] });
          });
        }}
      >
        {routing.locales.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
