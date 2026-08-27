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
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-12 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <span className="font-mono text-sm tracking-wide text-(--color-ink-muted)">
          {t("title")}
        </span>
        <div className="flex flex-wrap items-start gap-5">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-8">
        <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          {t("tagline")}
        </h1>

        <div className="flex flex-col gap-5 text-lg leading-relaxed text-pretty">
          <p>{t("problem")}</p>
          <p className="text-(--color-ink-muted)">{t("approach")}</p>
        </div>
      </main>

      <footer className="flex flex-col gap-3 border-t border-(--color-border) pt-6">
        <h2 className="text-xs font-medium tracking-wide text-(--color-ink-subtle) uppercase">
          {t("statusTitle")}
        </h2>
        <p className="text-sm text-(--color-ink-muted)">{t("status")}</p>
        <a
          className="w-fit text-sm text-(--color-accent) underline underline-offset-4"
          href="https://github.com/JoanOliver04/lexora"
          rel="noreferrer"
        >
          {t("repository")}
        </a>
      </footer>
    </div>
  );
}
