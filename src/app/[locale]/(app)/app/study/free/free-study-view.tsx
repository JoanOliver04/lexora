"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import {
  PracticeItemAnswer,
  PracticeItemPrompt,
} from "@/modules/library/presentation/practice-item-content";
import type { FreeStudyCard } from "@/modules/study/application/free-study";
import {
  newFreeStudyRun,
  nextFreeStudyCard,
  type FreeStudyRun,
} from "@/modules/study/application/free-study-run";
import { Button, FormError } from "@/shared/presentation/components";

import { loadFreeStudyCards, loadFreeStudyPool } from "./actions";
import { StudyDeckPicker } from "../study-deck-picker";

type View =
  | { kind: "setup" }
  | { kind: "card"; card: FreeStudyCard; index: number; revealed: boolean }
  | { kind: "summary"; total: number; distinct: number; seconds: number };

const panel =
  "rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-4 sm:p-6";

export function FreeStudyView({
  courseId,
  decks,
}: {
  courseId: string;
  decks: { id: string; title: string }[];
}) {
  const t = useTranslations("FreeStudy");
  const cardMessages = useTranslations("PracticeCard");
  const [view, setView] = useState<View>({ kind: "setup" });
  const [all, setAll] = useState(true);
  const [selection, setSelection] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"empty" | "unavailable" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const answer = useRef<HTMLDivElement>(null);
  const active = useRef<{ run: FreeStudyRun; startedAt: number } | null>(null);
  const operation = useRef<symbol | null>(null);
  const step = view.kind;
  const revealed = view.kind === "card" && view.revealed;

  useEffect(() => {
    if (step !== "setup") heading.current?.focus();
  }, [step]);

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

  function start() {
    return perform(async (current) => {
      const pool = await loadFreeStudyPool(courseId, all ? null : selection);
      if (!pool.ok) throw new Error("Free study pool unavailable");
      const run = newFreeStudyRun(pool.ids);
      const card = await nextFreeStudyCard(run, load);
      if (!current()) return;
      if (!card) {
        setError("empty");
        return;
      }
      active.current = { run, startedAt: performance.now() };
      setView({ kind: "card", card, index: run.cursor, revealed: false });
    });
  }

  function next() {
    const session = active.current;
    if (!session) return;
    return perform(async (current) => {
      const card = await nextFreeStudyCard(session.run, load);
      if (!current()) return;
      if (card) setView({ kind: "card", card, index: session.run.cursor, revealed: false });
      else setError("empty");
    });
  }

  function previous() {
    const run = active.current?.run;
    if (operation.current || !run || run.cursor <= 0) return;
    const card = run.trail[--run.cursor]!;
    setError(null);
    setView({ kind: "card", card, index: run.cursor, revealed: false });
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
            {issue}
            <Button
              className="w-full sm:w-fit"
              disabled={pending || (!all && selection.length === 0)}
              onClick={start}
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
        <Button className="w-full sm:w-fit" onClick={() => setView({ kind: "setup" })}>
          {t("restart")}
        </Button>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div aria-live="polite" aria-atomic="true" className={`${panel} flex min-w-0 flex-col gap-4`}>
        <h2 ref={heading} tabIndex={-1} className="text-sm font-semibold text-(--color-ink-muted)">
          {t("position", { count: view.index + 1 })}
        </h2>
        <PracticeItemPrompt content={view.card.content} hintLabel={cardMessages("hintLabel")} />
        {view.revealed ? (
          <div ref={answer} tabIndex={-1} className="border-s-2 border-(--color-accent) ps-4">
            <PracticeItemAnswer
              content={view.card.content}
              clozeAnswersLabel={cardMessages("clozeAnswersLabel")}
            />
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
        <Button className="flex-[1_1_auto] sm:flex-none" disabled={pending} onClick={next}>
          {t(pending ? "loading" : "next")}
        </Button>
        <Button
          variant="secondary"
          className="basis-full sm:ms-auto sm:basis-auto"
          onClick={finish}
        >
          {t("finish")}
        </Button>
      </div>
    </section>
  );
}
