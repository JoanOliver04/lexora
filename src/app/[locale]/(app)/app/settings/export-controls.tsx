"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { downloadOwnData } from "@/composition/data-export-browser";
import type { DataExportFailure, ExportFormat } from "@/modules/data-management/domain/data-export";
import { Button } from "@/shared/presentation/components";

export function ExportControls() {
  const t = useTranslations("DataExport");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<"success" | DataExportFailure | null>(null);
  const active = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const message = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (result) message.current?.focus();
  }, [result]);
  async function download(format: ExportFormat) {
    if (busy.current) return;
    busy.current = true;
    const controller = new AbortController();
    active.current = controller;
    setResult(null);
    setProgress(0);
    setPending(true);
    const outcome = await downloadOwnData(format, controller.signal, setProgress);
    busy.current = false;
    active.current = null;
    setPending(false);
    setResult(outcome.ok ? "success" : outcome.error);
  }
  return (
    <section
      aria-labelledby="export-title"
      className="flex min-w-0 flex-col gap-5 rounded-(--radius-surface) border border-(--color-border) p-5 sm:p-7"
    >
      <header className="flex flex-col gap-2">
        <h2 id="export-title" className="text-xl font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("description")}</p>
      </header>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="font-semibold">JSON</dt>
          <dd className="mt-1 leading-relaxed text-(--color-ink-muted)">{t("jsonNote")}</dd>
        </div>
        <div>
          <dt className="font-semibold">CSV</dt>
          <dd className="mt-1 leading-relaxed text-(--color-ink-muted)">{t("csvNote")}</dd>
        </div>
      </dl>
      <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("privacy")}</p>
      <fieldset disabled={pending} className="flex min-w-0 flex-wrap gap-3 border-0 p-0">
        <legend className="sr-only">{t("format")}</legend>
        <Button type="button" onClick={() => void download("json")}>
          {t("json")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void download("csv")}>
          {t("csv")}
        </Button>
      </fieldset>
      {pending && (
        <div className="flex flex-col gap-3">
          <p role="status" aria-live="polite">
            {progress === 0
              ? t("preparing")
              : progress < 100
                ? t("progress", { percent: progress })
                : t("checking")}
          </p>
          <div>
            <Button type="button" variant="secondary" onClick={() => active.current?.abort()}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
      {result && (
        <p
          ref={message}
          tabIndex={-1}
          role={result === "success" || result === "interrupted" ? "status" : "alert"}
          className="text-sm leading-relaxed"
        >
          {result === "success" ? t("success") : t(`errors.${result}`)}
        </p>
      )}
    </section>
  );
}
