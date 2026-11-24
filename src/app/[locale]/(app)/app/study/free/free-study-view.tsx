"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import {
  PracticeItemAnswer,
  PracticeItemPrompt,
} from "@/modules/library/presentation/practice-item-content";
import {
  FREE_STUDY_LENGTHS,
  type FreeStudyCard,
  type FreeStudyLength,
} from "@/modules/study/application/free-study";
import {
  markedFreeStudyRun,
  newFreeStudyRun,
  openPreparedFreeStudyRun,
  nextFreeStudyCard,
  type FreeStudyRun,
} from "@/modules/study/application/free-study-run";
import { Button, FormError } from "@/shared/presentation/components";

import { loadFreeStudyCards, startFreeStudyRound } from "./actions";
import { StudyDeckPicker } from "../study-deck-picker";
import { AnswerDraft } from "../answer-draft";

type View =
  | { kind: "setup" }
  | {
      kind: "card";
      card: FreeStudyCard;
      index: number;
      revealed: boolean;
      roundSize: number | null;
      markedRound: boolean;
    }
  | { kind: "summary"; total: number; distinct: number; seconds: number };

const panel =
  "rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-4 sm:p-6";

export function FreeStudyView({
  courseId,
  decks = [],
  initialDeckIds = null,
  difficultItemIds,
}: {
  courseId: string;
  decks?: { id: string; title: string }[];
  initialDeckIds?: string[] | null;
  difficultItemIds?: string[];
}) {
  const t = useTranslations("FreeStudy");
  const cardMessages = useTranslations("PracticeCard");
  const [view, setView] = useState<View>({ kind: "setup" });
  const [all, setAll] = useState(initialDeckIds === null);
  const [length, setLength] = useState<FreeStudyLength>("continuous");
  const [selection, setSelection] = useState<string[]>(initialDeckIds ?? []);
  const [marked, setMarked] = useState<Map<string, FreeStudyCard>>(() => new Map());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"empty" | "unavailable" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const returnToStart = useRef(false);
  const answer = useRef<HTMLDivElement>(null);
  const active = useRef<{ run: FreeStudyRun; startedAt: number } | null>(null);
  const operation = useRef<symbol | null>(null);
  const step = view.kind;
  const index = view.kind === "card" ? view.index : null;
  const revealed = view.kind === "card" && view.revealed;

  useEffect(() => {
    if (step !== "setup") heading.current?.focus();
    else if (returnToStart.current) {
      startButton.current?.focus();
      returnToStart.current = false;
    }
  }, [step, index]);

  useEffect(() => {
    if (revealed) answer.current?.focus();
  }, [revealed]);

  async function load(ids: string[]) {
    const result = await loadFreeStudyCards(courseId, ids);
    if (!result.ok) throw new Error("Free study cards unavailable");
    return result.cards;
  }

  async function perform(work: (current: () => boolean) => Promise<void>) {
    if (operation.current) return;
    const token = Symbol();
    operation.current = token;
    const current = () => operation.current === token;
    setPending(true);
    setError(null);
    try {
      await work(current);
    } catch {
      if (current()) setError("unavailable");
    } finally {
      if (current()) {
        operation.current = null;
        setPending(false);
      }
    }
  }

  function start(retryCards?: FreeStudyCard[]) {
    return perform(async (current) => {
      let run: FreeStudyRun;
      if (retryCards) {
        run = markedFreeStudyRun(retryCards);
      } else if (difficultItemIds) {
        run = newFreeStudyRun(difficultItemIds, "bounded");
      } else {
        const result = await startFreeStudyRound(courseId, all ? null : selection, length);
        if (!result.ok) throw new Error("Free study pool unavailable");
        run = openPreparedFreeStudyRun(result.round);
      }
      const card = await nextFreeStudyCard(run, load);
      if (!current()) return;
      if (!card) {
        setError("empty");
        return;
      }
      active.current = { run, startedAt: performance.now() };
      setMarked(new Map());
      showCard(run, card);
    });
  }

  function showCard(run: FreeStudyRun, card: FreeStudyCard) {
    setView({
      kind: "card",
      card,
      index: run.cursor,
      revealed: false,
      roundSize: run.kind === "continuous" ? null : run.pool.length,
      markedRound: run.kind === "marked",
    });
  }

  function next() {
    const session = active.current;
    if (!session) return;
    return perform(async (current) => {
      const card = await nextFreeStudyCard(session.run, load);
      if (!current()) return;
      if (card) showCard(session.run, card);
      else if (session.run.kind !== "continuous") finish();
      else setError("empty");
    });
  }

  function previous() {
    const run = active.current?.run;
    if (operation.current || !run || run.cursor <= 0) return;
    const card = run.trail[--run.cursor]!;
    setError(null);
    showCard(run, card);
  }

  function finish() {
    const session = active.current;
    if (!session) return;
    operation.current = null;
    active.current = null;
    setPending(false);
    setError(null);
    setView({
      kind: "summary",
      total: session.run.trail.length,
      distinct: new Set(session.run.trail.map(({ id }) => id)).size,
      seconds: Math.floor((performance.now() - session.startedAt) / 1_000),
    });
  }

  const issue = error && (
    <FormError id="free-study-error">
      <p>{t(`errors.${error}`)}</p>
    </FormError>
  );

  if (view.kind === "setup" && difficultItemIds) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button ref={startButton} disabled={pending} onClick={() => start()}>
          {pending ? t("loading") : t("startDifficult", { count: difficultItemIds.length })}
        </Button>
        <p className="text-sm text-(--color-ink-muted)">{t("difficultHint")}</p>
        {issue}
      </div>
    );
  }

  if (view.kind === "setup") {
    return (
      <section className={`${panel} flex min-w-0 flex-col gap-5`}>
        <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("intro")}</p>
        <fieldset disabled={pending || decks.length === 0} className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 font-semibold">{t("scope")}</legend>
          <label className="flex min-h-11 items-center gap-2.5">
            <input
              className="size-6 shrink-0"
              name="free-study-scope"
              type="radio"
              checked={all}
              onChange={() => setAll(true)}
            />
            {t("all")}
          </label>
          <label className="flex min-h-11 items-center gap-2.5">
            <input
              className="size-6 shrink-0"
              name="free-study-scope"
              type="radio"
              checked={!all}
              onChange={() => setAll(false)}
            />
            {t("selected")}
          </label>
          {!all && (
            <StudyDeckPicker decks={decks} selected={selection} onSelectionChange={setSelection} />
          )}
        </fieldset>
        {decks.length > 0 ? (
          <>
            <label className="flex min-w-0 flex-col gap-2">
              <span className="font-semibold">{t("lengthLabel")}</span>
              <select
                value={length}
                disabled={pending}
                onChange={(event) => {
                  const choice = FREE_STUDY_LENGTHS.find((value) => value === event.target.value);
                  if (choice) setLength(choice);
                }}
                className="min-h-11 w-full rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-base sm:w-fit"
              >
                {FREE_STUDY_LENGTHS.map((choice) => (
                  <option value={choice} key={choice}>
                    {t(`length.${choice}`)}
                  </option>
                ))}
              </select>
            </label>
            {issue}
            <Button
              className="w-full sm:w-fit"
              ref={startButton}
              disabled={pending || (!all && selection.length === 0)}
              onClick={() => start()}
            >
              {t(pending ? "loading" : "start")}
            </Button>
          </>
        ) : (
          <p className="flex flex-col gap-1">
            {t("emptyDecks")}
            <Link
              href="/decks"
              className="inline-flex min-h-11 w-fit items-center text-(--color-accent) underline"
            >
              {t("manageDecks")}
            </Link>
          </p>
        )}
      </section>
    );
  }

  if (view.kind === "summary") {
    const stats = [
      ["total", view.total],
      ["distinct", view.distinct],
      [
        "duration",
        t("elapsed", { minutes: Math.floor(view.seconds / 60), seconds: view.seconds % 60 }),
      ],
    ] as const;
    return (
      <section className={`${panel} flex min-w-0 flex-col gap-5`}>
        <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">
          {t("summary")}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          {stats.map(([label, value]) => (
            <div key={label} className="min-w-0 border-t border-(--color-border) pt-3">
              <dt className="text-sm text-(--color-ink-muted)">{t(label)}</dt>
              <dd className="mt-1 text-lg font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {issue}
        {marked.size > 0 && (
          <Button
            className="w-full sm:w-fit"
            disabled={pending}
            onClick={() => start([...marked.values()])}
          >
            {t("repeatMarked", { count: marked.size })}
          </Button>
        )}
        <Button
          variant={marked.size ? "secondary" : "primary"}
          className="w-full sm:w-fit"
          disabled={pending}
          onClick={() => {
            returnToStart.current = true;
            setMarked(new Map());
            setView({ kind: "setup" });
          }}
        >
          {t(difficultItemIds ? "backToDifficult" : "restart")}
        </Button>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div aria-live="polite" aria-atomic="true" className={`${panel} flex min-w-0 flex-col gap-4`}>
        <h2 ref={heading} tabIndex={-1} className="text-sm font-semibold text-(--color-ink-muted)">
          {view.roundSize === null
            ? t("position", { count: view.index + 1 })
            : t(view.markedRound ? "roundPosition" : "boundedPosition", {
                count: view.index + 1,
                total: view.roundSize,
              })}
        </h2>
        <PracticeItemPrompt content={view.card.content} hintLabel={cardMessages("hintLabel")} />
        <AnswerDraft key={view.index} />
        {view.revealed ? (
          <div className="flex flex-col gap-3">
            <div ref={answer} tabIndex={-1} className="border-s-2 border-(--color-accent) ps-4">
              <PracticeItemAnswer
                content={view.card.content}
                clozeAnswersLabel={cardMessages("clozeAnswersLabel")}
              />
            </div>
            <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="size-5"
                checked={marked.has(view.card.id)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setMarked((previous) => {
                    const nextMarks = new Map(previous);
                    if (checked) nextMarks.set(view.card.id, view.card);
                    else nextMarks.delete(view.card.id);
                    return nextMarks;
                  });
                }}
              />
              {t("mark")}
            </label>
          </div>
        ) : (
          <Button
            className="w-full sm:w-fit"
            disabled={pending}
            onClick={() => setView({ ...view, revealed: true })}
          >
            {cardMessages("reveal")}
          </Button>
        )}
      </div>
      {issue}
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          variant="secondary"
          className="flex-[1_1_auto] whitespace-nowrap sm:flex-none"
          disabled={pending || view.index === 0}
          onClick={previous}
        >
          {t("previous")}
        </Button>
        {view.index + 1 !== view.roundSize && (
          <Button className="flex-[1_1_auto] sm:flex-none" disabled={pending} onClick={next}>
            {t(pending ? "loading" : "next")}
          </Button>
        )}
        <Button
          variant={view.index + 1 === view.roundSize ? "primary" : "secondary"}
          className="basis-full sm:ms-auto sm:basis-auto"
          onClick={finish}
        >
          {t("finish")}
        </Button>
      </div>
    </section>
  );
}
