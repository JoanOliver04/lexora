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
    <label className="flex flex-col gap-1 text-xs">
      <span className="opacity-60">{t("label")}</span>
      <select
        className="rounded border border-current/20 bg-transparent px-2 py-1 text-sm"
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
