import { z } from "zod";
import { emailSchema, passwordSchema } from "@/modules/identity/application/credentials";

export type AccountDeletionFailure =
  | "invalid-input"
  | "invalid-credentials"
  | "unauthenticated"
  | "reauth-required"
  | "mfa-required"
  | "cooldown"
  | "unavailable";
export type AccountDeletionResult = { ok: true } | { ok: false; error: AccountDeletionFailure };
export const deletionInputSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmation: z.literal("DELETE"),
    acknowledged: z.literal(true),
    factorId: z.uuid().optional(),
    otp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .strict();
export type AccountDeletionInput = z.infer<typeof deletionInputSchema>;
export interface AccountDeletionFactors {
  requiresMfa: boolean;
  factors: { id: string; label: string | null }[];
}
export interface AccountDeletionGateway {
  reauthenticateAndDelete(input: AccountDeletionInput): Promise<AccountDeletionResult>;
}
export async function deleteOwnAccount(
  gateway: AccountDeletionGateway,
  input: unknown,
): Promise<AccountDeletionResult> {
  const parsed = deletionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-input" };
  try {
    return await gateway.reauthenticateAndDelete(parsed.data);
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
