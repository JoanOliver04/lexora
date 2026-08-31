import type { CefrLevel } from "@/modules/courses/domain/onboarding";

/**
 * El curso que la interfaz prioriza (LEX-2.9).
 *
 * `MASTER_SPEC.md` §192: en la V1 hay normalmente un solo curso, pero la
 * interfaz «priorizará uno activo». La persistencia vive en
 * `profiles.active_course_id` (FK compuesta con `id`: solo puede apuntar a un
 * curso del propio usuario). Aquí está la parte pura —elegir cuál mostrar— y
 * el puerto para leerlo.
 *
 * El **selector** entre varios cursos se pospone: hoy no hay entre qué elegir.
 */

export interface ActiveCourse {
  id: string;
  title: string;
  targetLocale: string;
  declaredLevel: CefrLevel | null;
  startLevel: CefrLevel | null;
}

/**
 * De entre los cursos del usuario, cuál es el activo:
 *
 *   1. el que señala `activeCourseId`, si sigue estando entre los suyos;
 *   2. si no (puntero a NULL, o a un curso ya borrado), el más antiguo;
 *   3. si no tiene cursos, ninguno.
 *
 * `courses` llega ya ordenado por antigüedad (el más antiguo primero).
 */
export function pickActiveCourse(
  courses: readonly ActiveCourse[],
  activeCourseId: string | null,
): ActiveCourse | null {
  if (courses.length === 0) {
    return null;
  }
  if (activeCourseId !== null) {
    const chosen = courses.find((course) => course.id === activeCourseId);
    if (chosen) {
      return chosen;
    }
  }
  return courses[0] ?? null;
}

/**
 * Puerto: alguien sabe leer el curso activo del usuario (ya resuelto por
 * `pickActiveCourse`). El `userId` lo deriva quien llama de `getClaims()`.
 */
export interface ActiveCourseRepository {
  getActiveCourse(userId: string): Promise<ActiveCourse | null>;
}
