import { z } from "zod";
import { MIN_NEW_PASSWORD_LENGTH } from "./password-policy";

/**
 * Validación de las credenciales de correo y contraseña.
 *
 * Se valida en el borde (MASTER_SPEC §16.2) y con límites de longitud
 * explícitos. La política de altas y cambios se mantiene alineada con Supabase
 * Auth. Se conserva la validación histórica al entrar con contraseñas existentes.
 */

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_BYTES = 72;

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: "email-required" })
  .max(MAX_EMAIL_LENGTH, { message: "email-invalid" })
  .pipe(z.email({ message: "email-invalid" }))
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, { message: "password-too-short" })
  .max(72, { message: "password-too-long" });

export const newPasswordSchema = z.string().superRefine((value, context) => {
  if (
    value.length > MAX_PASSWORD_BYTES ||
    new TextEncoder().encode(value).byteLength > MAX_PASSWORD_BYTES
  ) {
    context.addIssue({ code: "custom", message: "password-too-long" });
  } else if ([...value].length < MIN_NEW_PASSWORD_LENGTH) {
    context.addIssue({ code: "custom", message: "password-too-short" });
  }
});

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
const newCredentialsSchema = credentialsSchema.extend({ password: newPasswordSchema });

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
export function parseCredentials(
  input: { email: unknown; password: unknown },
  purpose: "login" | "registration" = "login",
): ParsedCredentials {
  const schema = purpose === "registration" ? newCredentialsSchema : credentialsSchema;
  const result = schema.safeParse(input);
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
