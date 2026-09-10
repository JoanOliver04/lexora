"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Link } from "@/i18n/navigation";
import { Button, FormError, FormStatus, Label } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { previewImportAction, type ImportPreviewState } from "./actions";
import {
  IMPORT_WIZARD_STEPS,
  canJumpToWizardStep,
  furthestWizardStep,
  nextWizardStep,
  previousWizardStep,
  type ImportWizardStep,
} from "./import-wizard";

const ERROR_ID = "import-preview-error";

const FILE_ERRORS = new Set(["no-file", "empty-file", "read-failed", "too-large", "too-many-rows"]);

const SELECT_CLASS = [
  "min-h-11 rounded-(--radius-control) px-3",
  "border border-(--color-border-strong)",
  "bg-(--color-surface) text-(--color-ink)",
].join(" ");

/**
 * Pasos inactivos: atributo `hidden` y **sin** `flex`. Una clase `flex` es
 * hoja de autor y gana al `display: none` del UA, así que el recap de
 * confirmar quedaría en el layout y Playwright vería textos duplicados.
 */
function stepSectionProps(
  active: boolean,
  gap: "gap-2" | "gap-3" | "gap-6",
): { hidden: boolean; className?: string } {
  return active ? { hidden: false, className: `flex flex-col ${gap}` } : { hidden: true };
}

/**
 * Wizard de importación (LEX-4.8): archivo → mapeo → mazo → duplicados →
 * confirmar. Cambiar el mapeo re-pinta a partir de `carried`. Confirmar
 * escribe conceptos, ítems y un `import_jobs` (LEX-4.7).
 */
export function ImportPreviewForm({
  locale,
  decks,
}: {
  locale: string;
  decks: { id: string; title: string }[];
}) {
  const [session, setSession] = useState(0);

  return (
    <ImportPreviewFormSession
      key={session}
      locale={locale}
      decks={decks}
      onAgain={() => setSession((current) => current + 1)}
    />
  );
}

function ImportPreviewFormSession({
  locale,
  decks,
  onAgain,
}: {
  locale: string;
  decks: { id: string; title: string }[];
  onAgain: () => void;
}) {
  const t = useTranslations("Import");
  const formRef = useRef<HTMLFormElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const [state, action] = useActionState<ImportPreviewState, FormData>(previewImportAction, {});
  const [step, setStep] = useState<ImportWizardStep>("file");
  const [furthest, setFurthest] = useState<ImportWizardStep>("file");
  const [moved, setMoved] = useState(false);
  const [openedForHash, setOpenedForHash] = useState("");
  const [deckId, setDeckId] = useState(state.deckId || decks[0]?.id || "");
  const [createReverse, setCreateReverse] = useState(state.createReverse === true);
  const [strategy, setStrategy] = useState(state.duplicateStrategy ?? "skip");

  useFocusFirstInvalid(formRef, state);

  const hasPreview = state.previewRows !== undefined;
  const columns = Array.from({ length: Math.max(state.columnCount ?? 0, 1) }, (_, index) => index);
  const selectedDeck = decks.find((deck) => deck.id === deckId);
  const previewHash = state.carried?.contentHash ?? "";

  if (hasPreview && previewHash && previewHash !== openedForHash) {
    setOpenedForHash(previewHash);
    setStep("mapping");
    setFurthest((current) => furthestWizardStep(current, "mapping"));
    setMoved(true);
  }

  useEffect(() => {
    if (moved) {
      stepHeadingRef.current?.focus();
    }
  }, [step, moved]);

  function goTo(next: ImportWizardStep) {
    setStep(next);
    setFurthest((current) => furthestWizardStep(current, next));
    setMoved(true);
  }

  if (state.result) {
    return (
      <FormStatus>
        <h2 className="text-lg font-medium">{t("result.heading")}</h2>
        <p className="text-sm">
          {t("result.counts", {
            created: state.result.rowsCreated,
            skipped: state.result.rowsSkipped,
            duplicate: state.result.rowsDuplicate,
            failed: state.result.rowsFailed,
            total: state.result.rowsTotal,
          })}
        </p>
        <Button type="button" variant="secondary" onClick={onAgain}>
          {t("wizard.another")}
        </Button>
      </FormStatus>
    );
  }

  const stepHeading =
    step === "file"
      ? t("wizard.fileHeading")
      : step === "mapping"
        ? t("mapping.heading")
        : step === "destination"
          ? t("wizard.destinationHeading")
          : step === "duplicates"
            ? t("plan.heading")
            : t("wizard.confirmHeading");

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <nav aria-label={t("wizard.navLabel")}>
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {IMPORT_WIZARD_STEPS.map((item, index) => {
            const current = item === step;
            const reachable = canJumpToWizardStep(item, furthest);
            const label = `${index + 1}. ${t(`wizard.step.${item}`)}`;
            return (
              <li key={item}>
                {reachable && !current ? (
                  <button
                    type="button"
                    className="text-(--color-ink-muted) underline underline-offset-4"
                    onClick={() => goTo(item)}
                  >
                    {label}
                  </button>
                ) : (
                  <span
                    aria-current={current ? "step" : undefined}
                    className={current ? "font-medium" : "text-(--color-ink-subtle)"}
                  >
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {state.error ? (
        <FormError id={ERROR_ID}>
          <p>{t(`errors.${state.error}`)}</p>
        </FormError>
      ) : null}

      <h2 ref={stepHeadingRef} tabIndex={-1} className="text-lg font-medium">
        {stepHeading}
      </h2>

      <section {...stepSectionProps(step === "file", "gap-2")}>
        <Label htmlFor="import-file">{t("fileLabel")}</Label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".txt,.csv,text/plain,text/csv"
          className="text-sm"
          aria-invalid={state.error && FILE_ERRORS.has(state.error) ? true : undefined}
          aria-describedby={state.error && FILE_ERRORS.has(state.error) ? ERROR_ID : undefined}
        />
        <p className="text-xs text-(--color-ink-subtle)">{t("fileHint")}</p>
      </section>

      {hasPreview ? (
        <>
          <input type="hidden" name="carried" value={JSON.stringify(state.carried)} />

          <section {...stepSectionProps(step === "mapping", "gap-6")}>
            <div className="flex flex-col gap-2 text-sm">
              <p>
                {t("separatorDetected", { separator: t(`separator.${state.separator}`) })}
                {state.separatorFromDirective ? ` ${t("separatorFromDirective")}` : null}
              </p>
              <p className="text-(--color-ink-muted)">
                {t("counts", {
                  valid: state.totalRows ?? 0,
                  issues: state.totalIssues ?? 0,
                })}
              </p>
              <p className="text-(--color-ink-muted)">
                {t("plan.counts", {
                  fresh: state.newCount ?? 0,
                  duplicates: state.duplicateCount ?? 0,
                })}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-front">{t("mapping.front")}</Label>
                <select
                  id="import-front"
                  name="frontColumn"
                  defaultValue={String(state.mapping?.front ?? 0)}
                  className={SELECT_CLASS}
                >
                  {columns.map((index) => (
                    <option key={index} value={index}>
                      {t("mapping.columnLabel", { n: index + 1 })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-back">{t("mapping.back")}</Label>
                <select
                  id="import-back"
                  name="backColumn"
                  defaultValue={String(state.mapping?.back ?? 1)}
                  className={SELECT_CLASS}
                >
                  {columns.map((index) => (
                    <option key={index} value={index}>
                      {t("mapping.columnLabel", { n: index + 1 })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-tags">{t("mapping.tags")}</Label>
                <select
                  id="import-tags"
                  name="tagsColumn"
                  defaultValue={
                    state.mapping?.tags === null ? "none" : String(state.mapping?.tags ?? 2)
                  }
                  className={SELECT_CLASS}
                >
                  <option value="none">{t("mapping.tagsNone")}</option>
                  {columns.map((index) => (
                    <option key={index} value={index}>
                      {t("mapping.columnLabel", { n: index + 1 })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-medium">{t("preview.heading")}</h3>
              {(state.previewRows ?? []).length === 0 ? (
                <p className="text-sm text-(--color-ink-muted)">{t("preview.empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-(--color-border) text-left">
                        <th className="py-1 pr-3 font-medium">{t("preview.row")}</th>
                        <th className="py-1 pr-3 font-medium">{t("preview.front")}</th>
                        <th className="py-1 pr-3 font-medium">{t("preview.back")}</th>
                        <th className="py-1 font-medium">{t("preview.tags")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(state.previewRows ?? []).map((previewRow) => (
                        <tr key={previewRow.rowNumber} className="border-b border-(--color-border)">
                          <td className="py-1 pr-3 text-(--color-ink-subtle)">
                            {previewRow.rowNumber}
                          </td>
                          <td className="py-1 pr-3">{previewRow.front}</td>
                          <td className="py-1 pr-3">{previewRow.back}</td>
                          <td className="py-1">{previewRow.tags.join(" ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {(state.previewIssues ?? []).length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="font-medium">{t("preview.issuesHeading")}</h3>
                <ul className="flex flex-col gap-1 text-sm text-(--color-ink-muted)">
                  {(state.previewIssues ?? []).map((issue) => (
                    <li key={`${issue.rowNumber}-${issue.code}`}>
                      {t("preview.issueRow", {
                        row: issue.rowNumber,
                        reason: t(`issue.${issue.code}`),
                      })}
                      {issue.sample ? (
                        <span className="mt-0.5 block font-mono text-xs text-(--color-ink-subtle)">
                          {issue.sample}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section {...stepSectionProps(step === "destination", "gap-3")}>
            {decks.length === 0 ? (
              <p className="text-sm text-(--color-ink-muted)">
                {t("execute.noDeck")}{" "}
                <Link href="/decks" className="underline underline-offset-4">
                  {t("execute.createDeck")}
                </Link>
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-deck">{t("execute.deck")}</Label>
                <select
                  id="import-deck"
                  name="deckId"
                  value={deckId}
                  onChange={(event) => setDeckId(event.target.value)}
                  className={SELECT_CLASS}
                >
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="createReverse"
                value="1"
                checked={createReverse}
                onChange={(event) => setCreateReverse(event.target.checked)}
              />
              {t("execute.reverse")}
            </label>
          </section>

          <section {...stepSectionProps(step === "duplicates", "gap-3")}>
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">{t("plan.heading")}</legend>
              <p className="text-sm text-(--color-ink-muted)">{t("plan.intro")}</p>
              <div className="flex flex-col gap-2">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="duplicateStrategy"
                    value="skip"
                    checked={strategy === "skip"}
                    onChange={() => setStrategy("skip")}
                  />
                  {t("plan.skip")}
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="duplicateStrategy"
                    value="copy"
                    checked={strategy === "copy"}
                    onChange={() => setStrategy("copy")}
                  />
                  {t("plan.copy")}
                </label>
              </div>
              <p className="text-xs text-(--color-ink-subtle)">{t("plan.updateNote")}</p>
            </fieldset>

            {(state.duplicateHits ?? []).length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="font-medium">{t("plan.hitsHeading")}</h3>
                <ul className="flex flex-col gap-1 text-sm text-(--color-ink-muted)">
                  {(state.duplicateHits ?? []).map((hit) => (
                    <li key={hit.rowNumber}>
                      {t("plan.hitRow", {
                        row: hit.rowNumber,
                        front: hit.front.slice(0, 80),
                      })}
                      {hit.existingTitles.length > 0
                        ? ` ${t("plan.hitExisting", { title: hit.existingTitles[0] ?? "" })}`
                        : null}
                      {hit.otherFileRows.length > 0
                        ? ` ${t("plan.hitFile", { rows: hit.otherFileRows.join(", ") })}`
                        : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section
            {...stepSectionProps(step === "confirm", "gap-3")}
            className={step === "confirm" ? "flex flex-col gap-3 text-sm" : undefined}
          >
            <p>{t("wizard.confirmIntro")}</p>
            <ul className="flex flex-col gap-1 text-(--color-ink-muted)">
              <li>
                {t("wizard.recapFile", {
                  filename: state.filename ?? state.carried?.filename ?? "",
                })}
              </li>
              <li>
                {t("wizard.recapCounts", {
                  valid: state.totalRows ?? 0,
                  issues: state.totalIssues ?? 0,
                  fresh: state.newCount ?? 0,
                  duplicates: state.duplicateCount ?? 0,
                })}
              </li>
              <li>
                {decks.length === 0
                  ? t("wizard.recapNoDeck")
                  : t("wizard.recapDeck", { deck: selectedDeck?.title ?? "" })}
              </li>
              <li>{createReverse ? t("wizard.recapReverseOn") : t("wizard.recapReverseOff")}</li>
              <li>{strategy === "copy" ? t("wizard.recapCopy") : t("wizard.recapSkip")}</li>
            </ul>
            <p className="text-xs text-(--color-ink-subtle)">{t("wizard.confirmHint")}</p>
          </section>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        {step === "file" ? <PendingButton idle={t("submit")} pending={t("submitting")} /> : null}
        {step === "mapping" ? (
          <>
            <PendingButton idle={t("resubmit")} pending={t("submitting")} />
            <p className="text-xs text-(--color-ink-subtle)">{t("resubmitHint")}</p>
          </>
        ) : null}
        {step === "confirm" && decks.length > 0 ? (
          <ExecuteButton idle={t("execute.submit")} pending={t("execute.submitting")} />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {previousWizardStep(step) ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const previous = previousWizardStep(step);
                if (previous) {
                  goTo(previous);
                }
              }}
            >
              {t("wizard.back")}
            </Button>
          ) : null}
          {hasPreview && nextWizardStep(step) ? (
            <Button
              type="button"
              variant={step === "mapping" ? "secondary" : "primary"}
              onClick={() => {
                const next = nextWizardStep(step);
                if (next) {
                  goTo(next);
                }
              }}
            >
              {t("wizard.continue")}
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function ExecuteButton({ idle, pending }: { idle: string; pending: string }) {
  const status = useFormStatus();

  return (
    <Button
      type="submit"
      name="intent"
      value="execute"
      disabled={status.pending}
      aria-busy={status.pending}
    >
      {status.pending ? pending : idle}
    </Button>
  );
}
