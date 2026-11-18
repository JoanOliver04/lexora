"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/presentation/components";
import { checkStudyStepsAction } from "./session-actions";

/** Informational duration from the server, never a browser-clock eligibility check. */
export function StudyStepWait({
  sessionId,
  remainingMs,
}: {
  sessionId: string;
  remainingMs: number;
}) {
  const t = useTranslations("StudySession");
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [status, setStatus] = useState<"waiting" | "refresh" | "error" | null>(null);
  const seconds = Math.max(1, Math.ceil((remaining ?? remainingMs) / 1_000));
  const pending = checking || refreshing;

  async function check() {
    setChecking(true);
    setStatus(null);
    try {
      const result = await checkStudyStepsAction(sessionId);
      setStatus(result.status);
      if (result.status === "waiting") setRemaining(result.remainingMs);
      if (result.status === "refresh") startTransition(() => router.refresh());
    } catch {
      setStatus("error");
    } finally {
      setChecking(false);
    }
  }
  return (
    <section
      data-testid="study-step-wait"
      aria-labelledby="study-step-wait-title"
      className="flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5"
    >
      <h2 id="study-step-wait-title" className="text-xl font-semibold">
        {t("stepWaitTitle")}
      </h2>
      <p>
        {seconds < 60
          ? t("stepWaitSeconds", { seconds })
          : t("stepWaitTime", { minutes: Math.ceil(seconds / 60) })}
      </p>
      <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("stepWaitHint")}</p>
      <Button disabled={pending} onClick={check}>
        {t(pending ? "checkingSteps" : "checkSteps")}
      </Button>
      <p role="status" className={status ? "text-sm text-(--color-ink-muted)" : "sr-only"}>
        {status ? t(`stepCheck.${status}`) : ""}
      </p>
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
