"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { StudySessionStatus } from "@/modules/study/domain/study-session";
import { Button, FormError } from "@/shared/presentation/components";
import type { SessionChangeState } from "./session-actions";

export interface SessionControlInfo {
  status: StudySessionStatus;
  canComplete: boolean;
}

export function SessionControls({
  locale,
  sessionId,
  session,
  action,
  pending,
  blocked,
  state,
}: {
  locale: string;
  sessionId: string;
  session: SessionControlInfo;
  action: (data: FormData) => void;
  pending: boolean;
  blocked: boolean;
  state: SessionChangeState;
}) {
  const t = useTranslations("StudySession");
  const router = useRouter();
  if (session.status === "completed" || session.status === "abandoned") return null;
  return (
    <section
      data-testid="session-controls"
      aria-labelledby="session-controls-title"
      className="flex flex-col gap-3 rounded-(--radius-surface) border border-(--color-border) p-5"
    >
      <h2 id="session-controls-title" className="text-lg font-semibold">
        {t("sessionControls")}
      </h2>
      <p className="text-sm">{t("lifecycleHint")}</p>
      {blocked && (
        <p role="status" className="text-sm">
          {t("resolveReviewFirst")}
        </p>
      )}
      {state.error && (
        <FormError id="session-change-error">
          <p>{t(`changeErrors.${state.error}`)}</p>
        </FormError>
      )}
      {state.error && (
        <Button variant="secondary" onClick={() => router.refresh()} disabled={pending || blocked}>
          {t("reloadSession")}
        </Button>
      )}
      <form action={action} className="flex flex-wrap gap-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="expectedStatus" value={session.status} />
        <Button
          type="submit"
          name="action"
          value={session.status === "paused" ? "resume" : "pause"}
          disabled={pending || blocked}
        >
          {t(
            pending
              ? "changingSession"
              : session.status === "paused"
                ? "resumeSession"
                : "pauseSession",
          )}
        </Button>
        {session.status === "active" && session.canComplete && (
          <Button type="submit" name="action" value="complete" disabled={pending || blocked}>
            {t("completeSession")}
          </Button>
        )}
        <Button
          type="submit"
          variant="secondary"
          name="action"
          value="abandon"
          disabled={pending || blocked}
        >
          {t("abandonSession")}
        </Button>
      </form>
    </section>
  );
}
