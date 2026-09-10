/**
 * Hash del contenido importado (LEX-4.7). Solo se guarda el digest, nunca el
 * archivo (LEX-4.3, §13.14). SHA-256 en hex (64 caracteres), dentro del CHECK
 * de `content_hash` (1..128).
 */

import { createHash } from "node:crypto";

export function hashImportContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
