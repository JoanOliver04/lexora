"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/presentation/components";

export function DashboardError({
  invalidFilter = false,
  retry,
}: {
  invalidFilter?: boolean;
  retry?: () => void;
}) {
  const t = useTranslations("Today");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section
      aria-labelledby="dashboard-error-title"
      className="rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-6"
    >
      <h2 id="dashboard-error-title" className="text-xl font-semibold">
        {t("errorTitle")}
      </h2>
      <p role="alert" className="mt-3 text-sm leading-relaxed text-(--color-ink-muted)">
        {t(invalidFilter ? "invalidFilter" : "errorDescription")}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-5">
        {!invalidFilter && (
          <Button
            disabled={pending}
            onClick={() => startTransition(() => (retry ? retry() : router.refresh()))}
          >
            {t(pending ? "loading" : "retry")}
          </Button>
        )}
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center text-sm text-(--color-accent) underline underline-offset-4"
        >
          {t("clearFilter")}
        </Link>
      </div>
    </section>
  );
}
