import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

import { LocaleSwitcher } from "./locale-switcher";

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Home");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
        <LocaleSwitcher />
      </header>

      <p className="text-lg text-balance">{t("tagline")}</p>

      <p className="text-sm leading-relaxed opacity-70">{t("explanation")}</p>

      <p className="text-xs uppercase tracking-wide opacity-50">{t("status")}</p>
    </main>
  );
}
