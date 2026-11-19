import { cache } from "react";
import { type ActiveCourse } from "@/modules/courses/application/active-course";
import { createCourse } from "@/modules/courses/application/create-course";
import { createSupabaseActiveCourseRepository } from "@/modules/courses/infrastructure/supabase-active-course-repository";
import { createSupabaseCourseCreationRepository } from "@/modules/courses/infrastructure/supabase-course-creation-repository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";

/**
 * Raíz de composición del módulo `courses` (LEX-2.9).
 *
 * `src/composition/` es el único sitio que conoce a la vez un caso de uso y su
 * implementación concreta (ADR-001). Aquí solo hay cableado.
 */

export type { ActiveCourse };

/**
 * Curso activo del usuario **autenticado en la petición en curso**, o `null`.
 * La identidad sale de `getClaims()` (firma verificada), nunca de un parámetro.
 * El shell de `(app)` lo usa para saber qué curso mostrar.
 */
export const getActiveCourseForCurrentUser = cache(async (): Promise<ActiveCourse | null> => {
  const client = await createSupabaseServerClient();

  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) {
    return null;
  }

  return createSupabaseActiveCourseRepository(client).getActiveCourse(userId);
});

export async function getTargetCourseLocales() {
  const client = await createSupabaseServerClient();
  return createSupabaseCourseCreationRepository(client).listTargetLocales();
}

export async function createCourseForCurrentUser(input: unknown) {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  return createCourse(createSupabaseCourseCreationRepository(client), input);
}
