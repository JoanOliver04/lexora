import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { GoogleSignInGateway } from "../application/google-sign-in";
import { AuthGatewayError } from "../application/auth-gateway";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

const providerSettings = z.object({
  external: z.object({ google: z.boolean() }),
  disable_signup: z.boolean().optional(),
});

const googleUnavailable = { signIn: false, signUp: false };

/** Cache only public provider flags. Never forward a session or Authorization header. */
export async function readGoogleAvailability(
  backendUrl: string,
  publishableKey: string,
  request: typeof fetch = fetch,
) {
  try {
    const response = await request(new URL("/auth/v1/settings", backendUrl), {
      headers: { apikey: publishableKey },
      credentials: "omit",
      cache: "force-cache",
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return googleUnavailable;
    const parsed = providerSettings.safeParse(await response.json());
    if (!parsed.success || !parsed.data.external.google) return googleUnavailable;
    return { signIn: true, signUp: parsed.data.disable_signup === false };
  } catch {
    return googleUnavailable;
  }
}

async function googleProviderAvailable(backendUrl: string, publishableKey: string) {
  return (await readGoogleAvailability(backendUrl, publishableKey)).signIn;
}

export function createSupabaseGoogleSignIn(
  client: SupabaseClient<Database>,
  backendUrl: string,
  publishableKey: string,
  available = () => googleProviderAvailable(backendUrl, publishableKey),
): GoogleSignInGateway {
  return {
    available,
    async begin(callbackUrl) {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true,
          scopes: "openid email profile",
          queryParams: { prompt: "select_account" },
        },
      });
      if (error || !data.url) throw new AuthGatewayError("google-unavailable");
      const target = new URL(data.url);
      if (
        target.origin !== new URL(backendUrl).origin ||
        target.pathname !== "/auth/v1/authorize" ||
        target.username ||
        target.password ||
        target.hash ||
        target.searchParams.get("provider") !== "google" ||
        target.searchParams.get("redirect_to") !== callbackUrl ||
        target.searchParams.get("code_challenge_method")?.toLowerCase() !== "s256" ||
        !/^[A-Za-z0-9_-]{43,128}$/.test(target.searchParams.get("code_challenge") ?? "")
      )
        throw new AuthGatewayError("google-unavailable");
      return target.toString();
    },
  };
}
