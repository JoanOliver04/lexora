/** Lexora exchanges and refreshes sessions exclusively on the server. */
export function supabaseCookieOptions(siteUrl: string) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(siteUrl).protocol === "https:",
  };
}
