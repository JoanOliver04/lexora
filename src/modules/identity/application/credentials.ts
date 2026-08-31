import { z } from "zod";

/**
 * Validación de las credenciales de correo y contraseña.
 *
 * Se valida en el borde (MASTER_SPEC §16.2) y con límites de longitud
 * explícitos. La contraseña se comprueba solo por longitud: la política de
 * fortaleza vive en Supabase Auth (`minimum_password_length`), y duplicar reglas
 * aquí las dejaría desincronizadas. El tope de 72 es el límite real de bcrypt;
 * por encima, los bytes sobrantes se ignoran en silencio, lo que sería una
 * contraseña «más larga» que en realidad no lo es.
 */

const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: "email-required" })
  .max(MAX_EMAIL_LENGTH, { message: "email-invalid" })
  .pipe(z.email({ message: "email-invalid" }))
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, { message: "password-too-short" })
  .max(MAX_PASSWORD_LENGTH, { message: "password-too-long" });

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** Motivo de rechazo de un formulario, como clave estable que traduce la UI. */
export type CredentialsIssue =
  "email-required" | "email-invalid" | "password-too-short" | "password-too-long";

export interface ParsedCredentials {
  ok: boolean;
  data?: Credentials;
  issue?: CredentialsIssue;
}

/**
 * Analiza `email` + `password` y devuelve el primer motivo de rechazo como
 * clave, nunca el detalle de Zod: la capa de aplicación no habla ningún idioma.
 */
export function parseCredentials(input: { email: unknown; password: unknown }): ParsedCredentials {
  const result = credentialsSchema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const issue = result.error.issues[0]?.message as CredentialsIssue | undefined;
  return { ok: false, issue: issue ?? "email-invalid" };
}

/** Igual que `parseCredentials` pero solo del correo (recuperación de contraseña). */
export function parseEmail(input: { email: unknown }): {
  ok: boolean;
  data?: string;
  issue?: CredentialsIssue;
} {
  const result = emailSchema.safeParse(input.email);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const issue = result.error.issues[0]?.message as CredentialsIssue | undefined;
  return { ok: false, issue: issue ?? "email-invalid" };
}
