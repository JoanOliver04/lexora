"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { answerMatches, type EoiPack } from "../domain/eoi";
import { ModelAudio } from "./eoi-exercise";
const field = "block min-h-11 w-full rounded border bg-transparent p-2";
const button = "min-h-11 rounded border px-3";
export function ListeningExam({
  pack,
  hashes,
  previews = {},
}: {
  pack: EoiPack;
  hashes: Record<string, string>;
  previews?: Record<string, string>;
}) {
  const t = useTranslations("Eoi");
  const [key, setKey] = useState(pack.sources.find((s) => s.audio)?.key ?? "");
  const [finished, setFinished] = useState<Record<string, boolean>>({}),
    [plays, setPlays] = useState<Record<string, number>>({}),
    [answers, setAnswers] = useState<Record<string, string>>({});
  const source = pack.sources.find((s) => s.key === key);
  const cards = pack.cards.filter((c) => c.source === key);
  const hash = source?.audio && hashes[source.audio];
  const done = !!finished[key];
  if (!hash || !source) return <p>{t("needAudio")}</p>;
  const audio = previews[hash] ?? "/api/eoi/audio/" + hash;
  return (
    <section className="flex flex-col gap-3 rounded border p-4">
      <h3>{t("exam")}</h3>
      <select
        aria-label={t("source")}
        className={field}
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
        }}
      >
        {pack.sources
          .filter((s) => s.audio)
          .map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
      </select>
      <ModelAudio
        key={key}
        url={audio}
        limit={2}
        played={plays[key] ?? 0}
        onStarted={() => setPlays((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))}
      />
      {cards.map((c) => (
        <label key={c.key}>
          {c.prompt}
          {c.type === "choice" ? (
            <select
              disabled={done}
              className={field}
              value={answers[c.key] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [c.key]: e.target.value })}
            >
              <option value=""></option>
              {c.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              className={field}
              disabled={done}
              value={answers[c.key] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [c.key]: e.target.value })}
            />
          )}
          {done && (
            <span className="block font-semibold">
              {answerMatches(answers[c.key] ?? "", c.answer, c.alternatives)
                ? t("match")
                : t("compare")}{" "}
              {c.answer}
              {c.evidence && " — " + c.evidence}
            </span>
          )}
        </label>
      ))}
      {done ? (
        <div>
          <p className="whitespace-pre-wrap">{source.transcript}</p>
          {cards
            .filter((c) => c.clip)
            .map((c) => (
              <div key={c.key}>
                <p>{c.prompt}</p>
                <ModelAudio url={audio} clip={c.clip} />
              </div>
            ))}
        </div>
      ) : (
        <button
          type="button"
          className={button}
          disabled={!cards.length || !cards.every((c) => answers[c.key]?.trim())}
          onClick={() => setFinished((prev) => ({ ...prev, [key]: true }))}
        >
          {t("finishExam")}
        </button>
      )}
    </section>
  );
}
