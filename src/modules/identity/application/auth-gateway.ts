import type { Credentials } from "./credentials";

/**
 * Puerto sobre el proveedor de autenticación (Supabase Auth). La capa de
 * aplicación coordina los flujos; no conoce `@supabase/*`.
 *
 * Regla transversal (MASTER_SPEC §16.1, gate §12.6): **ningún método revela si
 * un correo existe.** `register` y `requestPasswordReset` terminan igual tanto si
 * la dirección estaba registrada como si no.
 */
export interface AuthGateway {
  /**
   * Alta con correo y contraseña. Nunca distingue «correo nuevo» de «correo ya
   * registrado»: ambos devuelven el mismo `RegistrationResult`.
   */
  register(credentials: Credentials, emailRedirectTo: string): Promise<RegistrationResult>;

  /** Inicio de sesión. Lanza `InvalidCredentialsError` si no cuadra. */
  signIn(credentials: Credentials): Promise<void>;

  /** Cierre de sesión. Idempotente: sin sesión, no es un error. */
  signOut(): Promise<void>;

  /**
   * Envía el correo de recuperación si la dirección existe. Resuelve siempre,
   * exista o no, salvo fallo de infraestructura.
   */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;

  /**
   * Cambia la contraseña del usuario de la sesión en curso (llega desde el
   * enlace de recuperación). Lanza `WeakPasswordError` si el proveedor la
   * rechaza, `MissingRecoverySessionError` si no hay sesión.
   */
  updatePassword(newPassword: string): Promise<void>;

  /**
   * Canjea el `code` de un enlace de correo (flujo PKCE) por una sesión y la
   * deja en las cookies. Lanza `AuthCallbackError` si el código no vale o ha
   * caducado.
   */
  exchangeCode(code: string): Promise<void>;
}

/** El alta necesita confirmación por correo antes de poder iniciar sesión. */
export type RegistrationResult = "confirmation-required" | "signed-in";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("invalid-credentials");
    this.name = "InvalidCredentialsError";
  }
}

export class WeakPasswordError extends Error {
  constructor() {
    super("weak-password");
    this.name = "WeakPasswordError";
  }
}

export class MissingRecoverySessionError extends Error {
  constructor() {
    super("missing-recovery-session");
    this.name = "MissingRecoverySessionError";
  }
}

export class AuthCallbackError extends Error {
  constructor() {
    super("auth-callback-invalid");
    this.name = "AuthCallbackError";
  }
}

/** Fallo de infraestructura del proveedor, ya traducido y sin detalle interno. */
export class AuthGatewayError extends Error {
  constructor(message = "auth-unavailable", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AuthGatewayError";
  }
}
