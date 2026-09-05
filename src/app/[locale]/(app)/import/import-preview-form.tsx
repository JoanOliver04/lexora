"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormError, Label } from "@/shared/presentation/components";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { previewImportAction, type ImportPreviewState } from "./actions";

const ERROR_ID = "import-preview-error";

const SELECT_CLASS = [
  "min-h-11 rounded-(--radius-control) px-3",
  "border border-(--color-border-strong)",
  "bg-(--color-surface) text-(--color-ink)",
].join(" ");

/**
 * Subir un archivo, ver el separador detectado y una muestra acotada, y
 * mapear qué columna es frente/reverso/etiquetas (LEX-4.4). No persiste nada:
 * cambiar el mapeo re-pinta la muestra a partir del campo oculto `carried`
 * (las filas ya tokenizadas), sin volver a subir el archivo.
 */
export function ImportPreviewForm({ locale }: { locale: string }) {
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="import-file">{t("fileLabel")}</Label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".txt,.csv,text/plain,text/csv"
          className="text-sm"
        />
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
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <PendingButton idle={hasPreview ? t("resubmit") : t("submit")} pending={t("submitting")} />
        {hasPreview ? (
          <p className="text-xs text-(--color-ink-subtle)">{t("resubmitHint")}</p>
        ) : null}
      </div>
    </form>
  );
}
