import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

import { ThemeToggle } from "@/shared/presentation/theme/theme-toggle";

import { LocaleSwitcher } from "./locale-switcher";

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Home");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex flex-wrap items-start gap-4">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <p className="text-lg text-pretty">{t("tagline")}</p>

      <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("explanation")}</p>

      <p className="text-xs tracking-wide text-(--color-ink-subtle) uppercase">{t("status")}</p>
    </main>
  );
}
