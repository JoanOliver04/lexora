import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CompleteOnboardingError,
  type OnboardingRepository,
  type OnboardingResult,
} from "@/modules/courses/application/complete-onboarding";
import type { OnboardingSelection } from "@/modules/courses/domain/onboarding";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

/**
 * Implementación de `OnboardingRepository` sobre Supabase.
 *
 * Toda la escritura es una sola llamada RPC a `public.complete_onboarding`
 * (migración LEX-2.7): crear/actualizar el curso, upsert de `course_settings`
 * y marca del perfil, en una transacción. La función es SECURITY INVOKER, así
 * que corre bajo la identidad del propio usuario y sus políticas RLS
 * (LEX-2.3): este método no puede provisionar el curso de otra persona aunque
 * se le pase otro `userId`.
 *
 * El `userId` que recibe el puerto no viaja a la base de datos: la función usa
 * `auth.uid()` de la sesión verificada. El parámetro está en la firma para que
 * el caso de uso pueda comprobarlo (y para futuros back-ends), no para
 * confiarlo.
 */
export function createSupabaseOnboardingRepository(
  client: SupabaseClient<Database>,
): OnboardingRepository {
  return {
    async completeOnboarding(
      _userId: string,
      selection: OnboardingSelection,
    ): Promise<OnboardingResult> {
      const { data, error } = await client.rpc("complete_onboarding", {
        p_ui_locale: selection.uiLocale,
        p_declared_level: selection.declaredLevel,
        p_start_level: selection.startLevel,
        p_daily_new_limit: selection.dailyNewLimit,
      });

      if (error) {
        throw new CompleteOnboardingError(
          `no se pudo completar el onboarding (código ${error.code ?? "desconocido"})`,
          { cause: error },
        );
      }

      if (typeof data !== "string" || data === "") {
        throw new CompleteOnboardingError(
          "complete_onboarding no devolvió el identificador del curso",
        );
      }

      return { courseId: data };
    },
  };
}
