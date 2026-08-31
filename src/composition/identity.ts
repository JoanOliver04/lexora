import {
  ensureProfile,
  type EnsureProfileOutcome,
} from "@/modules/identity/application/ensure-profile";
import { createSupabaseProfileRepository } from "@/modules/identity/infrastructure/supabase-profile-repository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";

/**
 * Raíz de composición del módulo `identity`.
 *
 * `src/composition/` es el único sitio que puede conocer a la vez un caso de uso
 * y su implementación concreta (ADR-001). Aquí no hay lógica de negocio: solo
 * cableado.
 */

/**
 * Asegura el perfil del usuario **autenticado en la petición en curso**.
 *
 * La identidad sale de `getClaims()` —firma verificada contra las claves del
 * proyecto—, nunca de un parámetro (MASTER_SPEC §16.1). Si no hay sesión válida
 * no hay nada que asegurar y devuelve `null`; quién puede llegar hasta aquí sin
 * sesión lo decide la protección de rutas (LEX-2.6), que será quien llame a esta
 * función a la entrada del área autenticada.
 */
export async function ensureProfileForCurrentUser(): Promise<EnsureProfileOutcome | null> {
  const client = await createSupabaseServerClient();

  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) {
    return null;
  }

  return ensureProfile(createSupabaseProfileRepository(client), userId);
}
