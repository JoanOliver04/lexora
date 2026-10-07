"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/presentation/components";

export default function StudyErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("StudySession");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
      <p role="alert" className="text-sm text-(--color-ink-muted)">
        {t("errorDescription")}
      </p>
      <Button onClick={retry}>{t("retry")}</Button>
      <Link
        href="/app"
        className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
      >
        {t("backToToday")}
      </Link>
    </main>
  );
}
