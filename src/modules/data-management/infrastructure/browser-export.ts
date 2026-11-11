import {
  MAX_ARTIFACT_BYTES,
  type DataExportFailure,
  type ExportFormat,
} from "../domain/data-export";
export type BrowserExportResult = { ok: true } | { ok: false; error: DataExportFailure };
const failures = new Set<DataExportFailure>([
  "unauthenticated",
  "invalid-input",
  "cooldown",
  "too-large",
  "unavailable",
  "interrupted",
  "integrity",
]);
/** Publishes a download only after the complete response passes byte-count and hash checks. */
export async function downloadOwnData(
  format: ExportFormat,
  signal: AbortSignal,
  progress: (percent: number) => void,
): Promise<BrowserExportResult> {
  try {
    const response = await fetch("/api/account/export", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });
    if (!response.ok) {
      const body: unknown = await response.json();
      const error =
        body && typeof body === "object" && "error" in body ? body.error : "unavailable";
      return {
        ok: false,
        error:
          typeof error === "string" && failures.has(error as DataExportFailure)
            ? (error as DataExportFailure)
            : "unavailable",
      };
    }
    const expected = Number(response.headers.get("X-Lexora-Bytes"));
    const expectedHash = response.headers.get("X-Lexora-SHA256");
    if (
      !Number.isSafeInteger(expected) ||
      expected < 1 ||
      expected > MAX_ARTIFACT_BYTES ||
      !expectedHash ||
      !/^[a-f0-9]{64}$/.test(expectedHash) ||
      !response.body
    ) {
      await response.body?.cancel();
      return { ok: false, error: "integrity" };
    }
    const reader = response.body.getReader();
    const parts: ArrayBuffer[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > expected) {
          await reader.cancel();
          return { ok: false, error: "integrity" };
        }
        parts.push(value.slice().buffer);
        progress(Math.floor((bytes * 100) / expected));
      }
    } finally {
      reader.releaseLock();
    }
    if (bytes !== expected || signal.aborted)
      return { ok: false, error: signal.aborted ? "interrupted" : "integrity" };
    const blob = new Blob(parts, {
      type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
    });
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
    ]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== expectedHash || signal.aborted)
      return { ok: false, error: signal.aborted ? "interrupted" : "integrity" };
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    // Use a fixed safe name, never a path supplied by user content or a response.
    link.download = `lexora-export.${format}`;
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { ok: true };
  } catch {
    return { ok: false, error: signal.aborted ? "interrupted" : "unavailable" };
  }
}
