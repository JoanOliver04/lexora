import { cache } from "react";
import { type ActiveCourse } from "@/modules/courses/application/active-course";
import { createCourse } from "@/modules/courses/application/create-course";
import { createSupabaseActiveCourseRepository } from "@/modules/courses/infrastructure/supabase-active-course-repository";
import { createSupabaseCourseCreationRepository } from "@/modules/courses/infrastructure/supabase-course-creation-repository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";
import { getAuthenticatedUser } from "./identity";

/**
 * Raíz de composición del módulo `courses` (LEX-2.9).
 *
 * `src/composition/` es el único sitio que conoce a la vez un caso de uso y su
 * implementación concreta (ADR-001). Aquí solo hay cableado.
 */

export type { ActiveCourse };

/** Share the verified owner's profile between layouts and pages in this request. */
export const getWorkspaceProfileForCurrentUser = cache(async () => {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  return createSupabaseActiveCourseRepository(user.client).readWorkspaceProfile(user.ownerId);
});

export async function getActiveCourseForCurrentUser(): Promise<ActiveCourse | null> {
  return (await getWorkspaceProfileForCurrentUser())?.course ?? null;
}

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
