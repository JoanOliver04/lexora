"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  RestoreError,
  type RestoreFailure,
} from "@/modules/data-management/application/restore-error";
import {
  transferBackup,
  watchArchiveMedia,
  pendingTransfer,
  rememberTransfer,
  cancelBackup,
  prepareBackup,
  type PreparedBackup,
} from "@/composition/data-restore-browser";
import { Button, Input, Label } from "@/shared/presentation/components";

export function RestoreControls({ ownerId }: { ownerId: string }) {
  const t = useTranslations("DataRestore");
  const format = useFormatter();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const version = useRef(0);
  const started = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const [backup, setBackup] = useState<{ id: string; data: PreparedBackup } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<"success" | RestoreFailure | null>(null);

  useEffect(watchArchiveMedia, [ownerId]);
  useEffect(
    () => () => {
      version.current++;
      active.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (result) feedback.current?.focus();
  }, [result]);

  async function select(file: File | undefined) {
    const selection = ++version.current;
    setBackup(null);
    setConfirmation("");
    setResult(null);
    started.current = false;
    if (!file) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const data = await prepareBackup(file, ownerId);
      if (selection === version.current) {
        const previous = pendingTransfer(data);
        started.current = previous !== null;
        setBackup({ id: previous ?? crypto.randomUUID(), data });
      }
    } catch (error) {
      if (selection === version.current)
        setResult(error instanceof RestoreError ? error.kind : "unavailable");
    } finally {
      if (selection === version.current) setChecking(false);
    }
  }

  async function change(restore: boolean) {
    if (!backup || active.current || (restore && confirmation !== t("phrase"))) return;
    const controller = new AbortController();
    active.current = controller;
    setResult(null);
    setProgress(0);
    try {
      let outcome;
      if (restore || started.current) {
        if (controller.signal.aborted) return;
        if (restore) {
          started.current = true;
          rememberTransfer(backup.data, backup.id);
          outcome = await transferBackup(backup.id, backup.data, controller.signal, setProgress);
        } else {
          try {
            outcome = await cancelBackup(backup.id, backup.data, controller.signal);
          } catch (error) {
            // An absent or expired upload does not prevent discarding the preview.
            if (!(error instanceof RestoreError && error.kind === "conflict")) throw error;
          }
        }
      }
      if (controller.signal.aborted) return;
      rememberTransfer(backup.data, null);
      setBackup(null);
      setConfirmation("");
      started.current = false;
      if (fileInput.current) fileInput.current.value = "";
      if (outcome?.state === "restored") {
        setResult("success");
        router.refresh();
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setResult(error instanceof RestoreError ? error.kind : "unavailable");
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  return (
    <section
      aria-labelledby="restore-title"
      className="flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) p-5 sm:p-7"
    >
      <h2 id="restore-title" className="text-xl font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("description")}</p>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="restore-file">{t("file")}</Label>
        <Input
          id="restore-file"
          ref={fileInput}
          type="file"
          accept=".lexora,.json,.csv,application/json,text/csv"
          className="max-w-full py-1 file:me-3 file:min-h-11 file:cursor-pointer file:rounded-(--radius-control) file:border-0 file:bg-(--color-accent) file:px-3 file:font-semibold file:text-(--color-on-accent)"
          disabled={checking || progress !== null}
          onChange={(event) => void select(event.target.files?.[0])}
        />
      </div>
      {checking && <p role="status">{t("checking")}</p>}
      {backup && (
        <div className="flex min-w-0 flex-col gap-3">
          <p>
            {t("date", {
              date: format.dateTime(new Date(backup.data.exportedAtUtc), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
          <p>
            {t("counts", {
              decks: backup.data.counts.decks,
              cards: backup.data.counts.practice_items,
              reviews: backup.data.counts.review_logs,
            })}
          </p>
          {"manifest" in backup.data && (
            <p>{t("audioCount", { count: backup.data.audio.length })}</p>
          )}
          <p id="restore-warning" className="text-sm font-medium">
            {t("warning")}
          </p>
          <Label htmlFor="restore-confirmation">{t("confirm", { phrase: t("phrase") })}</Label>
          <Input
            id="restore-confirmation"
            type="text"
            aria-describedby="restore-warning"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={progress !== null}
            autoComplete="off"
            maxLength={32}
            spellCheck={false}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger"
              disabled={progress !== null || confirmation !== t("phrase")}
              onClick={() => void change(true)}
            >
              {t("restore")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={progress !== null}
              onClick={() => void change(false)}
            >
              {t("discard")}
            </Button>
          </div>
        </div>
      )}
      {progress !== null && (
        <p role="status">
          {progress < 100 ? t("uploading", { percent: progress }) : t("applying")}
        </p>
      )}
      {result && (
        <p ref={feedback} tabIndex={-1} role={result === "success" ? "status" : "alert"}>
          {result === "success" ? t("success") : t(`errors.${result}`)}
        </p>
      )}
    </section>
  );
}
