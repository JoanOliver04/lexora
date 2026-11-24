"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ImportDescriptor,
  ImportProgress,
} from "@/modules/importing/application/import-transfer";
import {
  ImportTransferError,
  type ImportTransferFailure,
} from "@/modules/importing/application/import-transfer-error";
import type { ImportJobError } from "@/modules/importing/application/import-job";
import { unwrapPastedImport } from "@/modules/importing/application/import-template";
import { MAX_FILE_BYTES } from "@/modules/importing/domain/limits";
import { readImportMapping, type ImportDestination, type ImportPreviewState } from "./import-state";

function rememberJob(job: ImportProgress) {
  const url = new URL(window.location.href);
  url.searchParams.set("job", job.id);
  window.history.replaceState(null, "", url);
}

export function useImportTransfer(
  courseId: string,
  locale: string,
  pending: ImportProgress | null,
  target: ImportDestination | null,
  sourceRevision: number,
) {
  const router = useRouter();
  const [job, setJob] = useState(pending);
  const [failure, setFailure] = useState<ImportTransferFailure | "paused" | null>(null);
  const [stopping, setStopping] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const currentJob = useRef(pending);
  const intent = useRef<ImportDescriptor | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  function updateJob(next: ImportProgress) {
    if (!mounted.current) return;
    currentJob.current = next;
    setJob(next);
    rememberJob(next);
    if (next.status === "completed") router.refresh();
  }

  const [state, action, busy] = useActionState<ImportPreviewState, FormData>(
    async (previous, form) => {
      const abort = new AbortController();
      controller.current = abort;
      setFailure(null);
      let retained = previous.sourceRevision === sourceRevision ? previous : {};
      try {
        let carried = retained.carried;
        let file = form.get("file");
        const pasted = form.get("import-text");
        if (typeof pasted === "string") {
          if (pasted.length > MAX_FILE_BYTES) return { error: "too-large" };
          const content = unwrapPastedImport(pasted);
          if (!content.trim()) return { error: "empty-file" };
          file = new File([content], "lexora-pasted.txt", { type: "text/plain;charset=utf-8" });
        }
        const newFile = file instanceof File && (file.size > 0 || file.name !== "") ? file : null;
        if (!newFile && !carried) return { error: "no-file" };
        const {
          prepareBrowserImport,
          readBrowserImportFile,
          runBrowserImport,
          transferBrowserImport,
          yieldImportControl,
        } = await import("@/composition/import-browser");
        abort.signal.throwIfAborted();
        if (newFile) {
          const loaded = await readBrowserImportFile(newFile);
          if (!loaded.ok) return { error: loaded.error };
          carried = loaded.carried;
        }
        if (!carried) return { error: "no-file" };
        retained =
          carried === previous.carried
            ? previous
            : { carried, filename: carried.filename, sourceRevision };
        const mapping = readImportMapping(
          carried === previous.carried ? form : new FormData(),
          Math.max(carried.columnCount, 1),
          (carried === previous.carried ? previous.mapping : pending?.mapping) ??
            carried.defaultMapping,
        );
        const sameMapping =
          previous.mapping?.front === mapping.front &&
          previous.mapping?.back === mapping.back &&
          previous.mapping?.tags === mapping.tags;
        const existingJob = currentJob.current;
        const deckMode = existingJob ? existingJob.mapping.deckMode : target?.mode;
        const deckId = existingJob?.deckId ?? target?.deckId ?? String(form.get("deckId") ?? "");
        const prepared =
          previous.prepared && previous.carried === carried && sameMapping
            ? previous.prepared
            : await prepareBrowserImport({
                rawRows: carried.rawRows,
                mapping,
                courseId,
                ...(deckMode && deckId ? { target: { deckId, mode: deckMode } } : {}),
                locale,
                transfer: transferBrowserImport,
                yieldControl: yieldImportControl,
                signal: abort.signal,
              });
        const strategy = !deckMode && form.get("duplicateStrategy") === "copy" ? "copy" : "skip";
        const createReverse = form.get("createReverse") === "1";
        const next: ImportPreviewState = {
          sourceRevision,
          carried,
          prepared,
          mapping,
          filename: carried.filename,
          separator: carried.separator,
          separatorFromDirective: carried.separatorFromDirective,
          columnCount: carried.columnCount,
          totalRows: prepared.validCount,
          totalIssues: prepared.issueCount,
          newCount: prepared.newCount,
          duplicateCount: prepared.duplicateCount,
          duplicateHits: prepared.duplicateHits,
          previewRows: prepared.previewRows,
          previewIssues: prepared.previewIssues,
          deckId,
          duplicateStrategy: strategy,
          createReverse,
        };
        if (form.get("intent") !== "execute") return next;
        if (!deckId) return { ...next, error: "no-deck" };
        if (deckMode === "replace") {
          if (!prepared.validCount) return { ...next, error: "empty" };
          if (form.get("replaceConfirmed") !== "1") return { ...next, error: "confirm-replace" };
        }
        const descriptor: ImportDescriptor = {
          id:
            intent.current?.fileHash === carried.contentHash
              ? intent.current.id
              : crypto.randomUUID(),
          courseId,
          deckId,
          filename: carried.filename,
          fileHash: carried.contentHash,
          rowsTotal: prepared.records.length,
          mapping: {
            ...mapping,
            strategy,
            createReverse,
            originalBytes: carried.originalBytes,
            ...(deckMode ? { deckMode } : {}),
          },
        };
        intent.current = descriptor;
        // Keep newly prepared rows when an acknowledgement or error-report fetch is lost.
        try {
          const completed = await runBrowserImport({
            descriptor,
            records: prepared.records,
            locale: locale === "en" ? "en" : "es",
            ...(currentJob.current ? { resumeJobId: currentJob.current.id } : {}),
            transfer: transferBrowserImport,
            signal: abort.signal,
            onProgress: updateJob,
          });
          const errors: ImportJobError[] = [];
          let after = 0;
          while (errors.length < completed.rowsFailed) {
            const response = await transferBrowserImport(
              { action: "errors", jobId: completed.id, after },
              abort.signal,
            );
            if (!response.ok) throw new ImportTransferError(response.error);
            if (!("errors" in response) || !response.errors.length)
              throw new ImportTransferError("unavailable");
            for (const row of response.errors) {
              if (row.rowNumber <= after) throw new ImportTransferError("unavailable");
              errors.push({
                rowNumber: row.rowNumber,
                code: row.code,
                message: row.message,
                rowSample: row.sample,
              });
              after = row.rowNumber;
            }
          }
          return { ...next, result: { ...completed, errors } };
        } catch (error) {
          setFailure(
            abort.signal.aborted
              ? "paused"
              : error instanceof ImportTransferError
                ? error.kind
                : "unavailable",
          );
          return next;
        }
      } catch (error) {
        setFailure(
          abort.signal.aborted
            ? "paused"
            : error instanceof ImportTransferError
              ? error.kind
              : "unavailable",
        );
        return retained;
      } finally {
        if (controller.current === abort) controller.current = null;
      }
    },
    {},
  );

  async function stop() {
    if (!currentJob.current || busy || stopping) return;
    setStopping(true);
    setFailure(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const { requestImportJob, transferBrowserImport } =
        await import("@/composition/import-browser");
      abort.signal.throwIfAborted();
      updateJob(
        await requestImportJob(
          transferBrowserImport,
          {
            action: "stop",
            jobId: currentJob.current.id,
          },
          abort.signal,
        ),
      );
    } catch (error) {
      setFailure(error instanceof ImportTransferError ? error.kind : "unavailable");
    } finally {
      if (controller.current === abort) controller.current = null;
      setStopping(false);
    }
  }
  return {
    state,
    action,
    busy,
    job,
    failure,
    stopping,
    stop,
    pause: () => controller.current?.abort(),
  };
}
