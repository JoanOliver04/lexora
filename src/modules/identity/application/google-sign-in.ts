import type { AuthResult } from "./auth-flows";

export interface GoogleSignInGateway {
  available(): Promise<boolean>;
  begin(callbackUrl: string): Promise<string>;
}

/** Provider failures never expose account existence, tokens or remote messages. */
export async function beginGoogleSignIn(
  gateway: GoogleSignInGateway,
  callbackUrl: string,
): Promise<AuthResult<{ url: string }>> {
  try {
    if (!(await gateway.available())) return { ok: false, error: "google-unavailable" };
    return { ok: true, url: await gateway.begin(callbackUrl) };
  } catch {
    return { ok: false, error: "google-unavailable" };
  }
}
