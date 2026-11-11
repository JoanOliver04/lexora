"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  PracticeItemAnswer,
  PracticeItemPrompt,
} from "@/modules/library/presentation/practice-item-content";
import {
  REVIEW_RATINGS,
  type ReviewRating,
  type StudyCard,
} from "@/modules/study/application/study-card";
import { Button, FormError } from "@/shared/presentation/components";
import { revealStudyCardAction, type RevealFormState } from "./reveal-actions";
import { submitStudyReview } from "./review-request";
import type { ReviewFormState } from "./review-state";
import { changeStudySessionAction, type SessionChangeState } from "./session-actions";
import { SessionControls, type SessionControlInfo } from "./session-controls";
import { useStudyShortcuts } from "./use-study-shortcuts";

async function changeWithRecovery(
  previous: SessionChangeState,
  data: FormData,
): Promise<SessionChangeState> {
  try {
    return await changeStudySessionAction(previous, data);
  } catch {
    return { error: "generic" };
  }
}

function subscribeConnection(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

async function revealWithRecovery(
  previous: RevealFormState,
  data: FormData,
): Promise<RevealFormState> {
  try {
    return await revealStudyCardAction(previous, data);
  } catch {
    return { error: "generic" };
  }
}

export function StudyCardView({
  locale,
  sessionId,
  card,
  session,
}: {
  locale: string;
  sessionId: string;
  card: StudyCard | null;
  session?: SessionControlInfo;
}) {
  const t = useTranslations("PracticeCard");
  const { refresh } = useRouter();
  const [reloadVersion, setReloadVersion] = useState(0);
  const [reviewState, reviewAction, reviewPending] = useActionState<ReviewFormState, FormData>(
    submitStudyReview,
    {},
  );
  const saveStatus = useRef<HTMLParagraphElement>(null);
  const [sessionState, sessionAction, sessionPending] = useActionState(changeWithRecovery, {});
  const unresolvedReview =
    !!reviewState.error && ["generic", "timeout", "offline"].includes(reviewState.error);
  useEffect(() => {
    if (reviewState.receipt) refresh();
  }, [reviewState.receipt, refresh]);
  useEffect(() => {
    if (!card && reviewState.receipt) saveStatus.current?.focus();
  }, [card, reviewState.receipt]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p
        ref={saveStatus}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="review-save-status"
        className="text-sm text-(--color-ink-muted)"
      >
        {reviewPending
          ? t("saving")
          : reviewState.receipt
            ? t("reviewSaved", { rating: t(`ratings.${reviewState.receipt.rating}.label`) })
            : ""}
      </p>
      {card && (
        <fieldset disabled={sessionPending} className="min-w-0 border-0 p-0">
          <StudyCardControls
            key={`${sessionId}:${card.practiceItemId}:${card.revision}:${JSON.stringify(card.prompt)}:${reloadVersion}`}
            locale={locale}
            sessionId={sessionId}
            card={card}
            reviewState={reviewState}
            reviewAction={reviewAction}
            reviewPending={reviewPending}
            onReload={() => {
              setReloadVersion((value) => value + 1);
              refresh();
            }}
          />
        </fieldset>
      )}
      {session && (
        <SessionControls
          locale={locale}
          sessionId={sessionId}
          session={session}
          action={sessionAction}
          pending={sessionPending}
          blocked={reviewPending || unresolvedReview}
          state={sessionState}
        />
      )}
    </div>
  );
}

function StudyCardControls({
  locale,
  sessionId,
  card,
  reviewState,
  reviewAction,
  reviewPending,
  onReload,
}: {
  locale: string;
  sessionId: string;
  card: StudyCard;
  reviewState: ReviewFormState;
  reviewAction: (data: FormData) => void;
  reviewPending: boolean;
  onReload: () => void;
}) {
  const t = useTranslations("PracticeCard");
  const [state, action, pending] = useActionState<RevealFormState, FormData>(
    revealWithRecovery,
    {},
  );
  const [rating, setRating] = useState<ReviewRating | null>(null);
  const [showIntervals, setShowIntervals] = useState(true);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const promptHeading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const reviewErrorRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);
  const revealLock = useRef(false);
  const shortcutRef = useStudyShortcuts();
  const online = useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
    () => true,
  );
  const reviewError = reviewState.requestId === state.reviewKey ? reviewState.error : undefined;
  const confirmed = reviewState.requestId === state.reviewKey && !!reviewState.receipt;
  const retryable =
    reviewError === "generic" || reviewError === "offline" || reviewError === "timeout";
  useEffect(() => {
    promptHeading.current?.focus();
  }, []);
  useEffect(() => {
    revealLock.current = pending;
  }, [pending, state]);
  useEffect(() => {
    submitLock.current = reviewPending || confirmed;
    if (reviewError && !reviewPending) reviewErrorRef.current?.focus();
  }, [reviewPending, reviewError, reviewState, confirmed]);
  useEffect(() => {
    if (state.content) answerHeading.current?.focus();
    else if (state.error) errorRef.current?.focus();
  }, [state]);
  const content = state.content ?? card.prompt;
  return (
    <section
      ref={shortcutRef}
      aria-labelledby="study-card-heading"
      data-testid="study-card"
      className="flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5"
    >
      <header className="flex flex-col gap-2">
        <h2
          ref={promptHeading}
          tabIndex={-1}
          id="study-card-heading"
          aria-describedby="study-prompt-text study-recall-instruction study-shortcuts"
          className="text-xl font-semibold"
        >
          {t("heading")}
        </h2>
        <p className="text-sm font-medium text-(--color-ink-muted)">{t(`modes.${content.mode}`)}</p>
      </header>
      <p id="study-recall-instruction" className="text-sm leading-relaxed text-(--color-ink-muted)">
        {t("recallInstruction")}
      </p>
      <div id="study-prompt-text">
        <PracticeItemPrompt content={content} hintLabel={t("hintLabel")} />
      </div>
      <p id="study-shortcuts" className="text-sm text-(--color-ink-muted)">
        {t("shortcuts")}
      </p>
      {!online && (
        <p role="status" className="text-sm">
          {t("offlineHint")}
        </p>
      )}
      {state.error && (
        <div ref={errorRef} tabIndex={-1}>
          <FormError id="study-reveal-error">
            <p>{t(`revealErrors.${state.error}`)}</p>
          </FormError>
          {state.error !== "generic" && (
            <Button variant="secondary" className="mt-3" onClick={onReload}>
              {t("reload")}
            </Button>
          )}
        </div>
      )}
      {!state.content && (
        <form
          action={action}
          onSubmit={(event) => {
            if (revealLock.current || !online) event.preventDefault();
            else revealLock.current = true;
          }}
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="practiceItemId" value={card.practiceItemId} />
          <Button
            data-study-shortcut="Space"
            aria-keyshortcuts="Space"
            type="submit"
            disabled={pending || !online}
            aria-describedby="study-recall-hint"
            className="w-full"
          >
            {t(pending ? "revealing" : state.error ? "retryReveal" : "reveal")}
          </Button>
        </form>
      )}
      <p id="study-recall-hint" className="text-sm text-(--color-ink-muted)">
        {t("revealHint")}
      </p>
      {state.content && (
        <div className="flex min-w-0 flex-col gap-3 border-t border-(--color-border) pt-4">
          <h3
            ref={answerHeading}
            tabIndex={-1}
            aria-describedby="study-answer-text study-shortcuts"
            className="text-lg font-semibold"
          >
            {t("answerHeading")}
          </h3>
          <div id="study-answer-text">
            <PracticeItemAnswer
              content={state.content}
              clozeAnswersLabel={t("clozeAnswersLabel")}
            />
          </div>
          {state.content.exampleText && (
            <div>
              <h4 className="font-medium">{t("exampleLabel")}</h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                {state.content.exampleText}
              </p>
            </div>
          )}
          {state.content.explanationText && (
            <div>
              <h4 className="font-medium">{t("explanationLabel")}</h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                {state.content.explanationText}
              </p>
            </div>
          )}
        </div>
      )}
      {state.content && state.preview && (
        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={showIntervals}
              onChange={(event) => setShowIntervals(event.target.checked)}
            />
            {t("showIntervals")}
          </label>
          {showIntervals && (
            <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("intervalHint")}</p>
          )}
        </div>
      )}
      {state.previewUnavailable && (
        <p role="status" className="text-sm">
          {t("intervalUnavailable")}
        </p>
      )}
      {reviewError && (
        <div ref={reviewErrorRef} tabIndex={-1}>
          <FormError id="study-review-error">
            <p>{t(`saveErrors.${reviewError}`)}</p>
          </FormError>
          {!retryable && (
            <Button variant="secondary" className="mt-3" onClick={onReload}>
              {t("reload")}
            </Button>
          )}
        </div>
      )}
      {confirmed && (
        <Button variant="secondary" onClick={onReload}>
          {t("reload")}
        </Button>
      )}
      <form
        action={reviewAction}
        onSubmit={(event) => {
          if (
            submitLock.current ||
            !online ||
            confirmed ||
            (reviewError && !retryable) ||
            !state.content ||
            !state.preview ||
            !state.reviewKey
          ) {
            event.preventDefault();
            return;
          }
          submitLock.current = true;
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="practiceItemId" value={card.practiceItemId} />
        <input type="hidden" name="idempotencyKey" value={state.reviewKey ?? ""} />
        <input type="hidden" name="expectedRevision" value={state.preview?.revision ?? "new"} />
        <fieldset
          disabled={
            !state.content ||
            !state.preview ||
            !state.reviewKey ||
            pending ||
            reviewPending ||
            !online ||
            confirmed ||
            (!!reviewError && !retryable)
          }
          className="min-w-0"
        >
          <legend className="mb-3 font-medium">{t("ratingHeading")}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REVIEW_RATINGS.map((value, index) => {
              const interval = state.preview?.intervals.find((entry) => entry.rating === value);
              return (
                <div key={value} className="min-w-0 space-y-2">
                  <Button
                    data-study-shortcut={index + 1}
                    aria-keyshortcuts={String(index + 1)}
                    type="submit"
                    name="rating"
                    value={value}
                    disabled={rating !== null && rating !== value}
                    aria-pressed={rating === value}
                    aria-describedby={`rating-${value}-help`}
                    variant={rating === value ? "primary" : "secondary"}
                    className="w-full"
                    onClick={(event) => {
                      if (submitLock.current || pending || reviewPending) event.preventDefault();
                      else if (state.content) setRating(value);
                    }}
                  >
                    {t(`ratings.${value}.label`)}
                  </Button>
                  {showIntervals && interval && (
                    <p data-testid={`interval-${value}`} className="text-sm font-medium">
                      {t("intervalApproximate", {
                        duration: intervalDuration(interval.intervalMs, t),
                      })}
                    </p>
                  )}
                  <p
                    id={`rating-${value}-help`}
                    className="text-sm leading-relaxed text-(--color-ink-muted)"
                  >
                    {t(`ratings.${value}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </fieldset>
        {retryable && rating && (
          <Button
            type="submit"
            name="rating"
            value={rating}
            disabled={!online || reviewPending}
            className="mt-3 w-full"
          >
            {t("retrySave")}
          </Button>
        )}
      </form>
      <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("saveHint")}</p>
    </section>
  );
}

/** Formatting only: durations already come from the authoritative server scheduler. */
function intervalDuration(
  ms: number,
  t: ReturnType<typeof useTranslations<"PracticeCard">>,
): string {
  if (ms < 60_000) return t("intervalUnderMinute");
  const [unit, divisor] =
    ms < 3_600_000
      ? (["minutes", 60_000] as const)
      : ms < 86_400_000
        ? (["hours", 3_600_000] as const)
        : (["days", 86_400_000] as const);
  return t(`intervalUnits.${unit}`, { count: Math.max(1, Math.round(ms / divisor)) });
}
