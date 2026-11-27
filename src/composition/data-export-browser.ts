"use client";
import type { ExportFormat } from "@/modules/data-management/domain/data-export";
import { downloadOwnData as downloadLegacy } from "@/modules/data-management/infrastructure/browser-export";

export async function downloadOwnData(
  format: ExportFormat | "archive",
  signal: AbortSignal,
  onProgress: (n: number) => void,
) {
  if (format === "archive") {
    const { downloadArchive } =
      await import("@/modules/data-management/infrastructure/browser-archive");
    return downloadArchive(signal, onProgress);
  }
  return downloadLegacy(format, signal, onProgress);
}
