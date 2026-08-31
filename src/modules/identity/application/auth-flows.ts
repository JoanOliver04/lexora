import {
  type AuthGateway,
  InvalidCredentialsError,
  MissingRecoverySessionError,
  type RegistrationResult,
  WeakPasswordError,
} from "./auth-gateway";
import { type CredentialsIssue, parseCredentials, parseEmail, passwordSchema } from "./credentials";

/**
 * Casos de uso de autenticación. Cada uno valida su entrada, llama al puerto y
 * devuelve un resultado discriminado con una **clave de error estable**; nunca
 * una cadena traducida (eso es cosa de la presentación) ni el error crudo del
 * proveedor. Un fallo de infraestructura se devuelve como `auth-unavailable`, no
 * se lanza: al otro lado hay un formulario, no una página que pueda romperse.
 *
 * Ninguno revela si un correo existe: alta y recuperación terminan igual con una
 * dirección conocida o desconocida.
 */

export type AuthErrorCode =
  | CredentialsIssue
  | "invalid-credentials"
  | "weak-password"
  | "missing-recovery-session"
  | "auth-unavailable";

export type AuthResult<T = Record<never, never>> =
  ({ ok: true } & T) | { ok: false; error: AuthErrorCode };

function failure(error: AuthErrorCode): { ok: false; error: AuthErrorCode } {
  return { ok: false, error };
}

export async function registerUser(
  gateway: AuthGateway,
  input: { email: unknown; password: unknown },
  emailRedirectTo: string,
): Promise<AuthResult<{ result: RegistrationResult }>> {
  const parsed = parseCredentials(input);
  if (!parsed.ok || !parsed.data) {
    return failure(parsed.issue ?? "email-invalid");
  }

  try {
    const result = await gateway.register(parsed.data, emailRedirectTo);
    return { ok: true, result };
  } catch (error) {
    if (error instanceof WeakPasswordError) {
      return failure("weak-password");
    }
    return failure("auth-unavailable");
  }
}

export async function signInUser(
  gateway: AuthGateway,
  input: { email: unknown; password: unknown },
): Promise<AuthResult> {
  const parsed = parseCredentials(input);
  if (!parsed.ok || !parsed.data) {
    // No se distingue «campo mal escrito» de «no cuadra»: en el login todo error
    // de credenciales es el mismo mensaje.
    return failure("invalid-credentials");
  }

  try {
    await gateway.signIn(parsed.data);
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return failure("invalid-credentials");
    }
    return failure("auth-unavailable");
  }
}

export async function requestPasswordReset(
  gateway: AuthGateway,
  input: { email: unknown },
  redirectTo: string,
): Promise<AuthResult> {
  const parsed = parseEmail(input);
  if (!parsed.ok || !parsed.data) {
    return failure(parsed.issue ?? "email-invalid");
  }

  try {
    await gateway.requestPasswordReset(parsed.data, redirectTo);
    return { ok: true };
  } catch {
    return failure("auth-unavailable");
  }
}

export async function updatePassword(
  gateway: AuthGateway,
  input: { password: unknown },
): Promise<AuthResult> {
  const result = passwordSchema.safeParse(input.password);
  if (!result.success) {
    const issue = result.error.issues[0]?.message as CredentialsIssue | undefined;
    return failure(issue ?? "password-too-short");
  }

  try {
    await gateway.updatePassword(result.data);
    return { ok: true };
  } catch (error) {
    if (error instanceof WeakPasswordError) {
      return failure("weak-password");
    }
    if (error instanceof MissingRecoverySessionError) {
      return failure("missing-recovery-session");
    }
    return failure("auth-unavailable");
  }
}
