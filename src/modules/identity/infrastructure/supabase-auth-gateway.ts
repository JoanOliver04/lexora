import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AuthCallbackError,
  type AuthGateway,
  AuthGatewayError,
  InvalidCredentialsError,
  MissingRecoverySessionError,
  type RegistrationResult,
  WeakPasswordError,
} from "@/modules/identity/application/auth-gateway";
import type { Credentials } from "@/modules/identity/application/credentials";

/**
 * Implementación de `AuthGateway` sobre Supabase Auth.
 *
 * El cliente llega ya creado (uno por petición, con la cookie de sesión). Todo
 * el mapeo de errores del proveedor a los errores del dominio vive aquí; hacia
 * arriba nunca sale un objeto de `@supabase/*` ni un mensaje del proveedor.
 *
 * **No revela si un correo existe:** un alta con correo repetido
 * (`user_already_exists`, que el stack local devuelve con
 * `enable_confirmations = false`) se traduce al mismo resultado que un alta
 * nueva. Y `email_not_confirmed` en el login se trata como credenciales
 * inválidas, no como «esa cuenta existe pero…».
 */
export function createSupabaseAuthGateway(client: SupabaseClient): AuthGateway {
  return {
    async register(
      { email, password }: Credentials,
      emailRedirectTo: string,
    ): Promise<RegistrationResult> {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });

      if (error) {
        if (isCode(error, "user_already_exists") || error.status === 422) {
          // Neutral: no se distingue de un alta nueva pendiente de confirmar.
          return "confirmation-required";
        }
        if (isCode(error, "weak_password")) {
          throw new WeakPasswordError();
        }
        throw new AuthGatewayError("auth-unavailable", { cause: error });
      }

      return data.session ? "signed-in" : "confirmation-required";
    },

    async signIn({ email, password }: Credentials): Promise<void> {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (!error) {
        return;
      }
      if (
        isCode(error, "invalid_credentials") ||
        isCode(error, "email_not_confirmed") ||
        error.status === 400
      ) {
        throw new InvalidCredentialsError();
      }
      throw new AuthGatewayError("auth-unavailable", { cause: error });
    },

    async signOut(): Promise<void> {
      // `scope: "local"` limpia esta sesión sin depender de que el servidor
      // acepte revocar; un error aquí no debe impedir cerrar sesión.
      await client.auth.signOut({ scope: "local" });
    },

    async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      // Un correo desconocido no da error. Si lo hay, es de infraestructura o
      // límite de envío: no delata que la cuenta exista.
      if (error) {
        throw new AuthGatewayError("auth-unavailable", { cause: error });
      }
    },

    async updatePassword(newPassword: string): Promise<void> {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (!error) {
        return;
      }
      if (isCode(error, "weak_password")) {
        throw new WeakPasswordError();
      }
      if (
        isCode(error, "session_not_found") ||
        error.name === "AuthSessionMissingError" ||
        error.status === 401
      ) {
        throw new MissingRecoverySessionError();
      }
      throw new AuthGatewayError("auth-unavailable", { cause: error });
    },

    async exchangeCode(code: string): Promise<void> {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        throw new AuthCallbackError();
      }
    },
  };
}

function isCode(error: { code?: string | null | undefined }, code: string): boolean {
  return error.code === code;
}
