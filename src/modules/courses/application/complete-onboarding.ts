import {
  type OnboardingIssue,
  type OnboardingSelection,
  validateOnboardingSelection,
} from "@/modules/courses/domain/onboarding";

/**
 * Caso de uso: completar el onboarding (LEX-2.7).
 *
 * Valida la selección (dominio) y delega la escritura —crear el curso y su
 * configuración, marcar el perfil— en un puerto. Esa escritura es **una sola
 * operación atómica e idempotente**: un usuario que repite el onboarding
 * actualiza su curso, nunca acaba con dos (MASTER_SPEC §9.3). La atomicidad la
 * garantiza la función SQL `complete_onboarding` detrás del puerto (ADR-002);
 * aquí solo se coordina.
 *
 * No hay pantallas: son LEX-2.8. El entregable termina en una función de
 * composición que LEX-2.8 llamará, igual que `ensureProfileForCurrentUser()`.
 */

/** Lo que devuelve el puerto tras provisionar el curso. */
export interface OnboardingResult {
  courseId: string;
}

/**
 * Puerto: alguien sabe crear —o actualizar, si ya existe— el curso del usuario
 * y su `course_settings`, y marcar `profiles.onboarding_completed_at`, todo en
 * una transacción. Idempotente: llamarlo dos veces deja un solo curso.
 *
 * El `userId` lo deriva siempre quien llama de la sesión verificada
 * (`getClaims()`), nunca de un valor del cliente (MASTER_SPEC §16.1).
 */
export interface OnboardingRepository {
  completeOnboarding(userId: string, selection: OnboardingSelection): Promise<OnboardingResult>;
}

/**
 * Fallo al completar el onboarding, ya traducido desde el error de
 * infraestructura. La capa de aplicación no deja escapar detalles del cliente
 * de base de datos.
 */
export class CompleteOnboardingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CompleteOnboardingError";
  }
}

export type CompleteOnboardingOutcome =
  { ok: true; courseId: string } | { ok: false; issues: OnboardingIssue[] };

export async function completeOnboarding(
  repository: OnboardingRepository,
  userId: string,
  rawSelection: unknown,
): Promise<CompleteOnboardingOutcome> {
  if (userId.trim() === "") {
    // Defensa en profundidad: quien llama ya deriva esto de `getClaims()`, así
    // que un identificador vacío aquí solo puede ser un error de programación.
    throw new CompleteOnboardingError("completeOnboarding invocado sin identificador de usuario");
  }

  const validation = validateOnboardingSelection(rawSelection);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  const { courseId } = await repository.completeOnboarding(userId, validation.value);
  return { ok: true, courseId };
}
