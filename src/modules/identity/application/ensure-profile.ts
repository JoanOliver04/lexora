/**
 * Garantiza que existe el perfil de aplicación del usuario autenticado.
 *
 * MASTER_SPEC §9.2: «Creación automática e idempotente del perfil de aplicación
 * asociado a `auth.users`.» Aquí «idempotente» significa que invocarlo varias
 * veces —un reintento, dos pestañas, dos peticiones concurrentes justo después
 * del alta— deja siempre exactamente una fila y nunca es un error.
 *
 * Por qué un caso de uso y no un trigger de base de datos: ADR-005.
 *
 * Este módulo no tiene carpeta `domain/` todavía: no hay lógica pura que colocar
 * ahí. La unicidad la garantiza la clave primaria de `profiles` (LEX-2.1) y el
 * aislamiento la política RLS `profiles_insert_own` (LEX-2.3).
 * `src/modules/README.md` permite explícitamente que un módulo trivial no repita
 * las cuatro capas.
 */

/** Resultado observable de asegurar el perfil. */
export type EnsureProfileOutcome = "created" | "already-existed";

/**
 * Puerto: alguien sabe crear la fila de perfil de un usuario si no existe, de
 * forma idempotente, y decir si la ha creado ahora o ya estaba.
 *
 * El `userId` lo deriva siempre quien llama de la sesión verificada
 * (`getClaims()`), nunca de un valor enviado por el cliente (MASTER_SPEC §16.1).
 */
export interface ProfileRepository {
  ensureExists(userId: string): Promise<EnsureProfileOutcome>;
}

/**
 * Fallo al asegurar el perfil, ya traducido desde el error de infraestructura.
 * La capa de aplicación no deja escapar detalles del cliente de base de datos.
 */
export class EnsureProfileError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EnsureProfileError";
  }
}

export async function ensureProfile(
  repository: ProfileRepository,
  userId: string,
): Promise<EnsureProfileOutcome> {
  if (userId.trim() === "") {
    // Defensa en profundidad. Quien llama ya deriva esto de `getClaims()`, así
    // que un identificador vacío aquí solo puede ser un error de programación:
    // mejor que falle ruidosamente que insertar una fila sin sentido.
    throw new EnsureProfileError("ensureProfile invocado sin identificador de usuario");
  }

  return repository.ensureExists(userId);
}
