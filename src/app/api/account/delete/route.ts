import { clientEnv } from "@/env/client";
import { deleteCurrentAccount } from "@/composition/account-deletion";
import { readPrivateJson } from "@/shared/presentation/http/read-private-json";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
export async function POST(request: Request) {
  const input = await readPrivateJson(request, clientEnv.NEXT_PUBLIC_SITE_URL, 2048);
  if (!input.ok) return new Response(null, { status: input.status, headers });
  const result = await deleteCurrentAccount(input.value);
  const status = result.ok
    ? 200
    : result.error === "unauthenticated" || result.error === "reauth-required"
      ? 401
      : result.error === "invalid-input"
        ? 400
        : result.error === "cooldown"
          ? 429
          : result.error === "invalid-credentials" || result.error === "mfa-required"
            ? 403
            : 503;
  return Response.json(result, {
    status,
    headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) },
  });
}
