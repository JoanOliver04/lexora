"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import {
  IMPORT_LESSON_TYPES,
  IMPORT_TEMPLATE_DIRECTIVE,
  importTemplateRows,
  serializeImportTemplate,
  type ImportAnswerLanguage,
  type ImportLessonType,
} from "@/modules/importing/application/import-template";
import {
  CEFR_LEVELS,
  SHORT_TEXT_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "@/modules/library/domain/taxonomy";
import { Button, Input, Label } from "@/shared/presentation/components";

const CARD_COUNTS = [20, 40, 60, 100, 150];
const fieldClass = "flex min-w-0 flex-col gap-1.5";
const selectClass =
  "min-h-12 w-full min-w-0 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-base";
const actionLink =
  "inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-(--color-accent) underline underline-offset-4";

function keepPromptInputFromSubmitting(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault();
}

const subscribeHydration = () => () => {};

export function ImportPreparation({
  courseLanguage: { locale: targetLocale, name: targetLanguage },
}: {
  courseLanguage: { locale: string; name: string };
}) {
  const t = useTranslations("Import.preparation");
  const target = targetLocale.split("-")[0] ?? targetLocale;
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [type, setType] = useState<ImportLessonType>("vocabulary");
  const [language, setLanguage] = useState<ImportAnswerLanguage>("es");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("B1");
  const [count, setCount] = useState(60);
  const [focus, setFocus] = useState("");
  const [copy, setCopy] = useState<{ prompt: string; state: "copied" | "manual" }>();
  const promptDetails = useRef<HTMLDetailsElement>(null);
  const promptText = useRef<HTMLTextAreaElement>(null);

  const rows = importTemplateRows(type, language, targetLocale);
  const hasSample = rows.length > 0;
  const csv = serializeImportTemplate(rows);
  const prompt = [
    t("prompt.goal", {
      topic: JSON.stringify(topic.trim() || t(`topics.${type}`)),
      level,
      count,
      targetLanguage,
    }),
    t(`prompt.${type}`, { targetLanguage }),
    t("prompt.coverage"),
    t("prompt.language", {
      language: language === "target" ? targetLanguage : t(`languages.${language}`),
      targetLanguage,
    }),
    focus.trim() ? t("prompt.focus", { focus: JSON.stringify(focus.trim()) }) : "",
    t("prompt.format", { directive: IMPORT_TEMPLATE_DIRECTIVE }),
    t("prompt.fields", { front: TITLE_MAX_LENGTH, back: SHORT_TEXT_MAX_LENGTH }),
    t("prompt.tags"),
    t("prompt.delivery"),
  ]
    .filter((line) => line !== "")
    .join("\n");
  const copyStatus = copy?.prompt === prompt ? t(copy.state) : "";

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopy({ prompt, state: "copied" });
    } catch {
      if (promptDetails.current) promptDetails.current.open = true;
      promptText.current?.focus();
      promptText.current?.select();
      setCopy({ prompt, state: "manual" });
    }
  }

  return (
    <section
      aria-labelledby="import-template-title"
      className="flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-[clamp(12px,4vw,20px)]"
    >
      <div className="flex flex-col gap-2">
        <h3 id="import-template-title" className="text-lg font-semibold">
          {t("title")}
        </h3>
        <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("intro")}</p>
        <a href="#import-source" className={`${actionLink} w-fit`}>
          {t("jumpToSource")}
        </a>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className={fieldClass}>
          <Label htmlFor="import-lesson-type">{t("type")}</Label>
          <select
            id="import-lesson-type"
            disabled={!ready}
            className={selectClass}
            value={type}
            onChange={(event) => {
              const choice = IMPORT_LESSON_TYPES.find((item) => item === event.target.value);
              if (choice) setType(choice);
            }}
          >
            {IMPORT_LESSON_TYPES.map((item) => (
              <option key={item} value={item}>
                {t(`types.${item}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldClass}>
          <Label htmlFor="import-answer-language">{t("answerLanguage")}</Label>
          <select
            id="import-answer-language"
            disabled={!ready}
            className={selectClass}
            value={language}
            onChange={(event) => {
              const choice = event.target.value;
              if (choice === "es" || choice === "en" || choice === "target") setLanguage(choice);
            }}
          >
            <option value="es">{t("languages.es")}</option>
            <option value="en">{t("languages.en")}</option>
            {target !== "en" && target !== "es" && <option value="target">{targetLanguage}</option>}
          </select>
        </div>
      </div>
      {hasSample ? (
        <>
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <li
                key={row.front}
                className="min-w-0 rounded-(--radius-control) border border-(--color-border) bg-(--color-surface-sunken) p-[clamp(10px,3vw,12px)]"
              >
                <dl className="flex min-w-0 flex-col gap-2.5 text-sm">
                  <div>
                    <dt className="text-xs text-(--color-ink-muted)">{t("columns.front")}</dt>
                    <dd className="font-semibold" lang={targetLocale}>
                      {row.front}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-(--color-ink-muted)">{t("columns.back")}</dt>
                    <dd lang={language === "target" ? targetLocale : language}>{row.back}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-(--color-ink-muted)">{t("columns.tags")}</dt>
                    <dd className="text-xs">{row.tags}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              className={actionLink}
              download={target === "en" ? `lexora-${type}.csv` : `lexora-${target}-${type}.csv`}
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
            >
              {t("download")}
            </a>
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm text-(--color-ink-muted) underline underline-offset-4">
                {t("raw")}
              </summary>
              <pre className="text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{csv}</pre>
            </details>
          </div>
        </>
      ) : (
        <p className="text-sm text-(--color-ink-muted)">{t("sampleUnavailable")}</p>
      )}
      <details className="border-t border-(--color-border) pt-2">
        <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">{t("assistant")}</summary>
        <div className="flex min-w-0 flex-col gap-4 pt-2">
          <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("instructions")}</p>
          <div className={fieldClass}>
            <Label htmlFor="import-lesson-topic">{t("topic")}</Label>
            <Input
              id="import-lesson-topic"
              disabled={!ready}
              placeholder={t(`topics.${type}`)}
              value={topic}
              maxLength={160}
              onChange={(event) => setTopic(event.target.value)}
              onKeyDown={keepPromptInputFromSubmitting}
            />
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className={fieldClass}>
              <Label htmlFor="import-lesson-level">{t("level", { targetLanguage })}</Label>
              <select
                id="import-lesson-level"
                disabled={!ready}
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className={selectClass}
              >
                {CEFR_LEVELS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className={fieldClass}>
              <Label htmlFor="import-lesson-count">{t("count")}</Label>
              <select
                id="import-lesson-count"
                disabled={!ready}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className={selectClass}
              >
                {CARD_COUNTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={fieldClass}>
            <Label htmlFor="import-lesson-focus">{t("focus")}</Label>
            <Input
              id="import-lesson-focus"
              disabled={!ready}
              placeholder={t("focusPlaceholder")}
              value={focus}
              maxLength={300}
              onChange={(event) => setFocus(event.target.value)}
              onKeyDown={keepPromptInputFromSubmitting}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button disabled={!ready} onClick={copyPrompt}>
              {t("copy")}
            </Button>
            <a className={actionLink} href="https://chatgpt.com/" target="_blank" rel="noreferrer">
              {t("chat")}
            </a>
          </div>
          <p role="status" className={copyStatus ? "text-sm" : "sr-only"}>
            {copyStatus}
          </p>
          <details ref={promptDetails}>
            <summary className="min-h-11 cursor-pointer py-2.5 text-sm underline underline-offset-4">
              {t("showPrompt")}
            </summary>
            <textarea
              ref={promptText}
              aria-label={t("showPrompt")}
              className={`${selectClass} min-h-32 resize-y py-2`}
              rows={6}
              readOnly
              value={prompt}
            />
          </details>
        </div>
      </details>
    </section>
  );
}
