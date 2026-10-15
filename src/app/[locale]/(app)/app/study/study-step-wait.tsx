"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/presentation/components";

/** Informational duration from the server, never a browser-clock eligibility check. */
export function StudyStepWait({ remainingMs }: { remainingMs: number }) {
  const t = useTranslations("StudySession");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section
      data-testid="study-step-wait"
      aria-labelledby="study-step-wait-title"
      className="flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5"
    >
      <h2 id="study-step-wait-title" className="text-xl font-semibold">
        {t("stepWaitTitle")}
      </h2>
      <p>{t("stepWaitTime", { minutes: Math.max(1, Math.ceil(remainingMs / 60_000)) })}</p>
      <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("stepWaitHint")}</p>
      <Button disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        {t(pending ? "checkingSteps" : "checkSteps")}
      </Button>
      <Link
        href="/app"
        prefetch={false}
        className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
      >
        {t("backToToday")}
      </Link>
    </section>
  );
}
