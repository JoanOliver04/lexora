import {
  type AuthErrorCode,
  type AuthResult,
  registerUser,
  requestPasswordReset,
  signInUser,
  updatePassword,
} from "@/modules/identity/application/auth-flows";
import {
  ensureProfile,
  MissingAuthOwnerError,
  type EnsureProfileOutcome,
} from "@/modules/identity/application/ensure-profile";
import { createSupabaseAuthGateway } from "@/modules/identity/infrastructure/supabase-auth-gateway";
import { createSupabaseProfileRepository } from "@/modules/identity/infrastructure/supabase-profile-repository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";
import { serverEnv } from "@/env/server";
import { registrationAllowed } from "@/modules/identity/domain/registration-policy";
import { privateBackendEnabled } from "@/env/deployment";

export function isRegistrationOpen(): boolean {
  return (
    privateBackendEnabled() &&
    registrationAllowed(serverEnv.NODE_ENV, serverEnv.LEXORA_ALLOW_REGISTRATION)
  );
}

/**
 * Raíz de composición del módulo `identity`.
 *
 * `src/composition/` es el único sitio que puede conocer a la vez un caso de uso
 * y su implementación concreta (ADR-001). Aquí no hay lógica de negocio: solo
 * cableado, y la secuencia «autenticar y asegurar el perfil».
 */

export type { AuthErrorCode, AuthResult };

/**
 * Asegura el perfil del usuario **autenticado en la petición en curso**.
 *
 * La identidad sale de `getClaims()` —firma verificada contra las claves del
 * proyecto—, nunca de un parámetro (MASTER_SPEC §16.1). Si no hay sesión válida
 * no hay nada que asegurar y devuelve `null`; quién puede llegar hasta aquí sin
 * sesión lo decide la protección de rutas (LEX-2.6).
 */
export async function ensureProfileForCurrentUser(): Promise<EnsureProfileOutcome | null> {
  if (!privateBackendEnabled()) return null;
  const client = await createSupabaseServerClient();

  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) {
    return null;
  }

  try {
    return await ensureProfile(createSupabaseProfileRepository(client), userId);
  } catch (error) {
    if (!(error instanceof MissingAuthOwnerError)) throw error;
    await client.auth.signOut({ scope: "local" });
    return null;
  }
}

/**
 * Identificador del usuario **autenticado en la petición en curso**, o `null`.
 * Deriva de `getClaims()` (firma verificada), nunca de `getSession()`.
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (!privateBackendEnabled()) return null;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error) {
    return null;
  }
  return data?.claims.sub ?? null;
}

/**
 * Alta con correo y contraseña. Si el alta deja sesión abierta
 * (`enable_confirmations = false`), se asegura el perfil de inmediato; si queda
 * pendiente de confirmar, lo hará el primer inicio de sesión.
 */
export async function registerVisitor(
  input: { email: unknown; password: unknown },
  emailRedirectTo: string,
): Promise<AuthResult<{ result: "confirmation-required" | "signed-in" }>> {
  if (!isRegistrationOpen()) return { ok: false, error: "registration-closed" };
  const client = await createSupabaseServerClient();
  const outcome = await registerUser(createSupabaseAuthGateway(client), input, emailRedirectTo);

  if (outcome.ok && outcome.result === "signed-in") {
    await ensureProfileForCurrentUser();
  }
  return outcome;
}

/** Inicio de sesión. Tras autenticar, asegura el perfil. */
export async function signInVisitor(input: {
  email: unknown;
  password: unknown;
}): Promise<AuthResult> {
  if (!privateBackendEnabled()) return { ok: false, error: "preview-disabled" };
  const client = await createSupabaseServerClient();
  const outcome = await signInUser(createSupabaseAuthGateway(client), input);

  if (outcome.ok) {
    await ensureProfileForCurrentUser();
  }
  return outcome;
}

/** Cierre de sesión. */
export async function signOutVisitor(): Promise<void> {
  if (!privateBackendEnabled()) return;
  const client = await createSupabaseServerClient();
  await createSupabaseAuthGateway(client).signOut();
}

/** Envío del correo de recuperación. Nunca revela si la dirección existe. */
export async function requestPasswordResetFor(
  input: { email: unknown },
  redirectTo: string,
): Promise<AuthResult> {
  if (!privateBackendEnabled()) return { ok: false, error: "preview-disabled" };
  const client = await createSupabaseServerClient();
  return requestPasswordReset(createSupabaseAuthGateway(client), input, redirectTo);
}

/** Cambio de contraseña del usuario que llega desde el enlace de recuperación. */
export async function updateCurrentPassword(input: { password: unknown }): Promise<AuthResult> {
  if (!privateBackendEnabled()) return { ok: false, error: "preview-disabled" };
  const client = await createSupabaseServerClient();
  return updatePassword(createSupabaseAuthGateway(client), input);
}

/**
 * Canjea el `code` de un enlace de correo por una sesión. Devuelve `false` si el
 * código no vale o ha caducado. Tras un canje válido, asegura el perfil.
 */
export async function completeAuthCallback(code: string): Promise<boolean> {
  if (!privateBackendEnabled()) return false;
  const client = await createSupabaseServerClient();
  try {
    await createSupabaseAuthGateway(client).exchangeCode(code);
  } catch {
    return false;
  }
  await ensureProfileForCurrentUser();
  return true;
}
