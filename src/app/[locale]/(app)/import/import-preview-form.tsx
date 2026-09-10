"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, FormError, Label } from "@/shared/presentation/components";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { previewImportAction, type ImportPreviewState } from "./actions";

const ERROR_ID = "import-preview-error";

const SELECT_CLASS = [
  "min-h-11 rounded-(--radius-control) px-3",
  "border border-(--color-border-strong)",
  "bg-(--color-surface) text-(--color-ink)",
].join(" ");

/**
 * Subir un archivo, mapear, ver duplicados e importar al curso (LEX-4.4…4.7).
 * Cambiar el mapeo re-pinta a partir de `carried`. Importar escribe
 * conceptos, ítems y un `import_jobs`.
 */
export function ImportPreviewForm({
  locale,
  decks,
}: {
  locale: string;
  decks: { id: string; title: string }[];
}) {
  const t = useTranslations("Import");
  const [state, action] = useActionState<ImportPreviewState, FormData>(previewImportAction, {});

  const hasPreview = state.previewRows !== undefined;
  const columns = Array.from({ length: Math.max(state.columnCount ?? 0, 1) }, (_, index) => index);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {state.error ? (
        <FormError id={ERROR_ID}>
          <p>{t(`errors.${state.error}`)}</p>
        </FormError>
      ) : null}

      {state.result ? (
        <section className="flex flex-col gap-2" role="status">
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
        </section>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="import-file">{t("fileLabel")}</Label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".txt,.csv,text/plain,text/csv"
          className="text-sm"
        />
        <p className="text-xs text-(--color-ink-subtle)">{t("fileHint")}</p>
      </div>

      {hasPreview ? (
        <>
          <input type="hidden" name="carried" value={JSON.stringify(state.carried)} />

          <section className="flex flex-col gap-2 text-sm">
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
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{t("mapping.heading")}</h2>
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
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{t("preview.heading")}</h2>
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
          </section>

          <section className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-3">
              <legend className="text-lg font-medium">{t("plan.heading")}</legend>
              <p className="text-sm text-(--color-ink-muted)">{t("plan.intro")}</p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="duplicateStrategy"
                    value="skip"
                    defaultChecked={(state.duplicateStrategy ?? "skip") === "skip"}
                  />
                  {t("plan.skip")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="duplicateStrategy"
                    value="copy"
                    defaultChecked={state.duplicateStrategy === "copy"}
                  />
                  {t("plan.copy")}
                </label>
              </div>
              <p className="text-xs text-(--color-ink-subtle)">{t("plan.updateNote")}</p>
            </fieldset>

            {(state.duplicateHits ?? []).length > 0 ? (
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-medium">{t("plan.hitsHeading")}</h2>
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

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{t("execute.heading")}</h2>
            {decks.length === 0 ? (
              <p className="text-sm text-(--color-ink-muted)">{t("execute.noDeck")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-deck">{t("execute.deck")}</Label>
                <select
                  id="import-deck"
                  name="deckId"
                  defaultValue={state.deckId || decks[0]?.id}
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="createReverse"
                value="1"
                defaultChecked={state.createReverse === true}
              />
              {t("execute.reverse")}
            </label>
          </section>

          {(state.previewIssues ?? []).length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">{t("preview.issuesHeading")}</h2>
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
            </section>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <PendingButton idle={hasPreview ? t("resubmit") : t("submit")} pending={t("submitting")} />
        {hasPreview && decks.length > 0 ? (
          <Button type="submit" name="intent" value="execute">
            {t("execute.submit")}
          </Button>
        ) : null}
        {hasPreview ? (
          <p className="text-xs text-(--color-ink-subtle)">{t("resubmitHint")}</p>
        ) : null}
      </div>
    </form>
  );
}
