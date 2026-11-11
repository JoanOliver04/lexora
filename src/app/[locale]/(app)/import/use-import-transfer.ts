"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  readBrowserImportFile,
  transferBrowserImport,
  yieldImportControl,
} from "@/composition/import-browser";
import {
  ImportTransferError,
  type ImportDescriptor,
  type ImportProgress,
  type ImportTransferFailure,
} from "@/modules/importing/application/import-transfer";
import { prepareBrowserImport } from "@/modules/importing/application/prepare-browser-import";
import {
  requestImportJob,
  runBrowserImport,
} from "@/modules/importing/application/run-browser-import";
import type { ImportJobError } from "@/modules/importing/application/import-job";
import { readImportMapping, type ImportPreviewState } from "./import-state";

function rememberJob(job: ImportProgress) {
  const url = new URL(window.location.href);
  url.searchParams.set("job", job.id);
  window.history.replaceState(null, "", url);
}

export function useImportTransfer(
  courseId: string,
  locale: string,
  pending: ImportProgress | null,
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
      let retained = previous;
      try {
        let carried = previous.carried;
        const file = form.get("file");
        if (file instanceof File && (file.size > 0 || file.name !== "")) {
          const loaded = await readBrowserImportFile(file);
          if (!loaded.ok) return { error: loaded.error };
          carried = loaded.carried;
        }
        if (!carried) return { ...previous, error: "no-file" };
        retained =
          carried === previous.carried ? previous : { carried, filename: carried.filename };
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
        const prepared =
          previous.prepared && previous.carried === carried && sameMapping
            ? previous.prepared
            : await prepareBrowserImport({
                rawRows: carried.rawRows,
                mapping,
                courseId,
                locale,
                transfer: transferBrowserImport,
                yieldControl: yieldImportControl,
                signal: abort.signal,
              });
        const deckId = String(form.get("deckId") ?? pending?.deckId ?? "");
        const strategy = form.get("duplicateStrategy") === "copy" ? "copy" : "skip";
        const createReverse = form.get("createReverse") === "1";
        const next: ImportPreviewState = {
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
          mapping: { ...mapping, strategy, createReverse, originalBytes: carried.originalBytes },
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
