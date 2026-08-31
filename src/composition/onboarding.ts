import {
  type CompleteOnboardingOutcome,
  completeOnboarding,
} from "@/modules/courses/application/complete-onboarding";
import { createSupabaseOnboardingRepository } from "@/modules/courses/infrastructure/supabase-onboarding-repository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";

/**
 * Raíz de composición del onboarding (LEX-2.7).
 *
 * `src/composition/` es el único sitio que conoce a la vez el caso de uso y su
 * implementación concreta (ADR-001). Aquí no hay lógica: solo cableado.
 *
 * LEX-2.8 (pantallas) llamará a esto desde una Server Action, igual que las de
 * `identity` llaman a `ensureProfileForCurrentUser()`.
 */

export type { CompleteOnboardingOutcome };

/**
 * Completa el onboarding del usuario **autenticado en la petición en curso**.
 *
 * La identidad sale de `getClaims()` —firma verificada—, nunca de un parámetro
 * (MASTER_SPEC §16.1). Si no hay sesión válida devuelve `null`; quién puede
 * llegar hasta aquí sin sesión lo decide la protección de rutas (LEX-2.6).
 *
 * `rawSelection` es lo que envía el formulario, sin validar: la validación es
 * del dominio y ocurre dentro del caso de uso.
 */
export async function completeOnboardingForCurrentUser(
  rawSelection: unknown,
): Promise<CompleteOnboardingOutcome | null> {
  const client = await createSupabaseServerClient();

  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) {
    return null;
  }

  return completeOnboarding(createSupabaseOnboardingRepository(client), userId, rawSelection);
}
