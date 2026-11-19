"use client";

export {
  requestRestore,
  restorePreparedBackup,
} from "@/modules/data-management/infrastructure/browser-restore";
export type { PreparedBackup } from "@/modules/data-management/infrastructure/portable-backup";

export async function prepareBackup(file: Blob, ownerId: string) {
  const parser = await import("@/modules/data-management/infrastructure/portable-backup");
  return parser.prepareBackup(file, ownerId);
}
