"use client";
export { watchArchiveMedia } from "@/modules/data-management/infrastructure/browser-archive-maintenance";
import type { PreparedArchive } from "@/modules/data-management/application/account-archive";
import type { PreparedBackup as LegacyBackup } from "@/modules/data-management/infrastructure/portable-backup";

export type PreparedBackup = PreparedArchive | LegacyBackup;

// Keep only the operation ID in this tab. Selecting the same file after a
// recent sign-in can resume the upload without persisting any backup contents.
export function pendingTransfer(backup: PreparedBackup) {
  if ("manifestHash" in backup) {
    try {
      return sessionStorage.getItem("lexora:restore:" + backup.manifestHash);
    } catch {
      return null;
    }
  }
  return null;
}
export function rememberTransfer(backup: PreparedBackup, id: string | null) {
  if (!("manifestHash" in backup)) return;
  try {
    const key = "lexora:restore:" + backup.manifestHash;
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    /* Storage is optional when cookies or site data are restricted. */
  }
}
export async function prepareBackup(file: Blob, ownerId: string): Promise<PreparedBackup> {
  if ((await file.slice(0, 8).text()) === "LEXORA1\n") {
    const { prepareArchive } =
      await import("@/modules/data-management/application/account-archive");
    return prepareArchive(file, ownerId);
  }
  const parser = await import("@/modules/data-management/infrastructure/portable-backup");
  return parser.prepareBackup(file, ownerId);
}
export async function transferBackup(
  id: string,
  backup: PreparedBackup,
  signal: AbortSignal,
  progress: (n: number) => void,
) {
  if ("manifest" in backup) {
    const { restoreArchive } =
      await import("@/modules/data-management/infrastructure/browser-archive");
    return restoreArchive(id, backup, signal, progress);
  }
  const { restorePreparedBackup } =
    await import("@/modules/data-management/infrastructure/browser-restore");
  return restorePreparedBackup(id, backup, signal, progress);
}
export async function cancelBackup(id: string, backup: PreparedBackup, signal: AbortSignal) {
  if ("manifest" in backup) {
    const { cancelArchive } =
      await import("@/modules/data-management/infrastructure/browser-archive");
    return cancelArchive(id, signal);
  }
  const { requestRestore } =
    await import("@/modules/data-management/infrastructure/browser-restore");
  return requestRestore({ action: "cancel", id }, signal);
}
