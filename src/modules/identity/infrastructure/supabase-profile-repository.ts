import type { SupabaseClient } from "@supabase/supabase-js";

import {
  EnsureProfileError,
  type EnsureProfileOutcome,
  type ProfileRepository,
} from "@/modules/identity/application/ensure-profile";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

/**
 * Implementación de `ProfileRepository` sobre Supabase.
 *
 * El cliente llega ya creado —uno por petición, con la cookie de sesión—. La
 * fila se inserta bajo la identidad del propio usuario: la política
 * `profiles_insert_own` (LEX-2.3) exige `auth.uid() = id`, así que este método
 * no puede crear el perfil de otra persona aunque se le pase otro `userId`; el
 * intento se traduce en un `EnsureProfileError`.
 *
 * Idempotencia: `upsert` con `ignoreDuplicates` se traduce en PostgREST a
 * `INSERT ... ON CONFLICT (id) DO NOTHING`. `select()` devuelve la fila cuando
 * la inserta y un array vacío cuando ya existía —comportamiento verificado
 * contra el stack local—, y de ahí sale `created` vs `already-existed`. La
 * unicidad de fondo la garantiza la clave primaria de `profiles` (LEX-2.1), no
 * esta cláusula.
 */
export function createSupabaseProfileRepository(
  client: SupabaseClient<Database>,
): ProfileRepository {
  return {
    async ensureExists(userId: string): Promise<EnsureProfileOutcome> {
      const { data, error } = await client
        .from("profiles")
        .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true })
        .select("id");

      if (error) {
        throw new EnsureProfileError(
          `no se pudo asegurar el perfil (código ${error.code ?? "desconocido"})`,
          { cause: error },
        );
      }

      return data.length > 0 ? "created" : "already-existed";
    },

    async hasCompletedOnboarding(userId: string): Promise<boolean> {
      // `maybeSingle`: sin fila (perfil aún no asegurado) devuelve `data: null`
      // sin lanzar. La política `profiles_select_own` (LEX-2.3) limita la
      // lectura a la fila propia.
      const { data, error } = await client
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw new EnsureProfileError(
          `no se pudo leer el estado de onboarding (código ${error.code ?? "desconocido"})`,
          { cause: error },
        );
      }

      return data?.onboarding_completed_at != null;
    },
  };
}
