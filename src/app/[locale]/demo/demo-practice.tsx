"use client";

import { type ReactNode, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import type { UiLocale } from "@/i18n/routing";
import { REVIEW_RATINGS } from "@/modules/study/domain/memory";
import { demoCopy, type DemoCopy } from "./demo-copy";
import {
  CORRECT_PLATFORM,
  createDemoStore,
  grammarMatches,
  PLATFORMS,
  TRANSCRIPT,
  VOCABULARY,
  type DemoState,
  type ReviewInterval,
} from "./demo-state";
import styles from "./demo.module.css";

type Props = { locale: UiLocale; intervals: ReviewInterval[]; account: ReactNode };

function intervalLabel(minutes: number, t: DemoCopy, locale: UiLocale) {
  const useDays = minutes >= 1440;
  const count = useDays ? Math.round(minutes / 1440) : minutes;
  const unit = useDays ? t.dayUnit : t.minUnit;
  return `${Intl.NumberFormat(locale).format(count)} ${unit}${count === 1 ? "" : "s"}`;
}

function Itinerary({ stage, t }: { stage: DemoState["stage"]; t: DemoCopy }) {
  return (
    <ol className={styles["itinerary"]} aria-label={t.itinerary}>
      {t.stages.map((label, i) => (
        <li key={label} aria-current={i === stage ? "step" : undefined} data-done={i < stage}>
          <span className={styles["marker"]} aria-hidden="true">
            {i < stage ? "✓" : i + 1}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function Result({
  t,
  locale,
  state,
  account,
  restart,
}: {
  t: DemoCopy;
  locale: UiLocale;
  state: DemoState;
  account: ReactNode;
  restart: () => void;
}) {
  const { review, draft, platform } = state;
  if (!review || !platform) return null;
  const grammarCorrect = grammarMatches(draft);
  const platformCorrect = platform === CORRECT_PLATFORM;
  return (
    <div className={styles["stack"]}>
      <p className={styles["score"]}>
        <strong>{Number(grammarCorrect) + Number(platformCorrect)}/2</strong> {t.resultLabel}
      </p>
      <dl className={styles["breakdown"]}>
        <div>
          <dt>{t.stages[0]}</dt>
          <dd>
            <span lang="en">{VOCABULARY}</span>
            <small>
              {t.selfRating} · {t.ratings[review.rating]}
            </small>
          </dd>
        </div>
        <div>
          <dt>{t.stages[1]}</dt>
          <dd>
            <span lang="en">{draft}</span>
            <small>{grammarCorrect ? t.correct : t.incorrect}</small>
          </dd>
        </div>
        <div>
          <dt>{t.stages[2]}</dt>
          <dd>
            <span lang="en">{platform}</span>
            <small>{platformCorrect ? t.correct : t.incorrect}</small>
          </dd>
        </div>
      </dl>
      <section className={styles["plan"]} aria-labelledby="demo-review-title">
        <h3 id="demo-review-title">{t.reviewHeading}</h3>
        <p className={styles["planLine"]}>
          <span lang="en">{VOCABULARY}</span>
          <strong>{intervalLabel(review.minutes, t, locale)}</strong>
        </p>
        <p>{t.reviewTip}</p>
      </section>
      <section className={styles["account"]} aria-labelledby="demo-account-title">
        <h3 id="demo-account-title">{t.account}</h3>
        <p>{t.accountHint}</p>
        <div>{account}</div>
      </section>
      <button type="button" className={styles["secondary"]} onClick={restart}>
        {t.restart}
      </button>
    </div>
  );
}

export function DemoPractice({ locale, intervals, account }: Props) {
  const t = demoCopy[locale];
  const [store] = useState(createDemoStore);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [audioFailed, setAudioFailed] = useState(false);
  const { stage, revealed, grammarChecked, listeningChecked } = state;
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLHeadingElement>(null);
  const meaning = useRef<HTMLParagraphElement>(null);
  const nextFocus = useRef<"heading" | "feedback" | "meaning" | null>(null);

  useLayoutEffect(() => {
    const targets = { heading, feedback, meaning };
    if (nextFocus.current) targets[nextFocus.current].current?.focus();
    nextFocus.current = null;
  }, [stage, revealed, grammarChecked, listeningChecked]);

  function navigate(next: DemoState["stage"], data?: Partial<DemoState>) {
    nextFocus.current = "heading";
    store.update({ ...data, stage: next });
  }

  return (
    <div className={styles["practice"]}>
      <Itinerary stage={stage} t={t} />
      <section className={styles["card"]} aria-labelledby="demo-stage-title">
        {stage < 3 && (
          <p className={styles["eyebrow"]}>
            {t.stop} {stage + 1} {t.of} 3 · {t.stages[stage]}
          </p>
        )}
        <h2 id="demo-stage-title" ref={heading} tabIndex={-1}>
          {t.headings[stage]}
        </h2>
        {stage === 0 && (
          <div className={styles["stack"]}>
            <p>{t.recall}</p>
            <div className={styles["flashcard"]}>
              <p className={styles["word"]} lang="en">
                {VOCABULARY}
              </p>
              {revealed && (
                <div className={styles["definition"]}>
                  <p ref={meaning} tabIndex={-1}>
                    {t.meaning}
                  </p>
                  <p lang="en">“A return ticket to Brighton, please.”</p>
                </div>
              )}
            </div>
            {!revealed ? (
              <button
                type="button"
                className={styles["primary"]}
                onClick={() => {
                  nextFocus.current = "meaning";
                  store.update({ revealed: true });
                }}
              >
                {t.reveal}
              </button>
            ) : (
              <fieldset className={styles["ratingField"]}>
                <legend>{t.rate}</legend>
                <div>
                  {REVIEW_RATINGS.map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => {
                        const review = intervals.find((option) => option.rating === rating);
                        if (review) navigate(1, { review });
                      }}
                    >
                      {t.ratings[rating]}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}
        {stage === 1 && (
          <form
            className={styles["stack"]}
            onSubmit={(event) => {
              event.preventDefault();
              if (!state.draft.trim() || grammarChecked) return;
              nextFocus.current = "feedback";
              store.update({ grammarChecked: true });
            }}
          >
            <p>{t.grammar}</p>
            <p lang="en" className={styles["sentence"]}>
              My train <span className={styles["blank"]}>___</span> <em>(arrive)</em> yet.
            </p>
            <label className={styles["answer"]}>
              {t.answer}
              <input
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                lang="en"
                value={state.draft}
                maxLength={120}
                readOnly={grammarChecked}
                onChange={(event) => store.update({ draft: event.target.value })}
              />
            </label>
            {grammarChecked ? (
              <>
                <div className={styles["feedback"]}>
                  <h3 ref={feedback} tabIndex={-1}>
                    {grammarMatches(state.draft) ? t.correct : t.incorrect}
                  </h3>
                  <p className={styles["modelAnswer"]} lang="en">
                    My train <strong>hasn’t arrived</strong> yet.
                  </p>
                  <p>
                    {t.also} <strong lang="en">has not arrived</strong>.
                  </p>
                  <p>{t.grammarTip}</p>
                </div>
                <button type="button" className={styles["primary"]} onClick={() => navigate(2)}>
                  {t.nextListening}
                  <span aria-hidden="true"> →</span>
                </button>
              </>
            ) : (
              <button type="submit" className={styles["primary"]} disabled={!state.draft.trim()}>
                {t.check}
              </button>
            )}
          </form>
        )}
        {stage === 2 && (
          <form
            className={styles["stack"]}
            onSubmit={(event) => {
              event.preventDefault();
              if (!state.platform || listeningChecked) return;
              nextFocus.current = "feedback";
              store.update({ listeningChecked: true });
            }}
          >
            <p>{t.listening}</p>
            <div className={styles["audioBox"]}>
              <p>{t.audio}</p>
              <audio
                controls
                preload="none"
                src="/demo-media/platform-announcement.mp3"
                aria-label={t.audio}
                onError={() => setAudioFailed(true)}
                onPlaying={() => setAudioFailed(false)}
              />
              {audioFailed && <p role="status">{t.audioUnavailable}</p>}
              <details>
                <summary>{t.transcript}</summary>
                <p lang="en">{TRANSCRIPT}</p>
              </details>
            </div>
            <fieldset className={styles["choices"]} disabled={listeningChecked}>
              <legend>{t.choose}</legend>
              {PLATFORMS.map((platform) => (
                <label key={platform}>
                  <input
                    type="radio"
                    name="demo-platform"
                    checked={state.platform === platform}
                    onChange={() => store.update({ platform })}
                  />
                  <span lang="en">{platform}</span>
                </label>
              ))}
            </fieldset>
            {listeningChecked ? (
              <>
                <div className={styles["feedback"]}>
                  <h3 ref={feedback} tabIndex={-1}>
                    {state.platform === CORRECT_PLATFORM ? t.correct : t.incorrect}
                  </h3>
                  <p className={styles["modelAnswer"]} lang="en">
                    <strong>{CORRECT_PLATFORM}</strong>
                  </p>
                  <p>{t.listeningTip}</p>
                </div>
                <button type="button" className={styles["primary"]} onClick={() => navigate(3)}>
                  {t.finish}
                  <span aria-hidden="true"> →</span>
                </button>
              </>
            ) : (
              <button type="submit" className={styles["primary"]} disabled={!state.platform}>
                {t.check}
              </button>
            )}
          </form>
        )}
        {stage === 3 && (
          <Result
            t={t}
            locale={locale}
            state={state}
            account={account}
            restart={() => {
              nextFocus.current = "heading";
              setAudioFailed(false);
              store.restart();
            }}
          />
        )}
      </section>
      <p className={styles["localHint"]}>{t.session}</p>
    </div>
  );
}
