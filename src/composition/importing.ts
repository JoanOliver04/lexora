import type { DelimitedFileParser } from "@/modules/importing/application/delimited-file-parser";
import type { ImportJobRepository } from "@/modules/importing/application/import-job";
import { createPapaParseDelimitedFileParser } from "@/modules/importing/infrastructure/papaparse-delimited-file-parser";
import { createSupabaseImportJobRepository } from "@/modules/importing/infrastructure/supabase-import-job-repository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";

/**
 * Raíz de composición del módulo `importing` (LEX-4.2, trabajos LEX-4.7).
 *
 * `src/composition/` es el único sitio que conoce a la vez el puerto y su
 * implementación concreta (ADR-001). Parsear un archivo no necesita
 * identidad; escribir `import_jobs` sí.
 */
export function createDelimitedFileParser(): DelimitedFileParser {
  return createPapaParseDelimitedFileParser();
}

/**
 * Repositorio de trabajos del usuario autenticado en esta petición, o `null`
 * si no hay sesión. La identidad sale de `getClaims()`.
 */
export async function getImportJobRepositoryForCurrentUser(): Promise<ImportJobRepository | null> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims.sub) {
    return null;
  }
  return createSupabaseImportJobRepository(client);
}
