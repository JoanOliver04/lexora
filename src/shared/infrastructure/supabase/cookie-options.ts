/** HTTP loopback stays usable; canonical HTTPS never issues an insecure cookie. */
export function supabaseCookieOptions(siteUrl: string) {
  return { path: "/", sameSite: "lax" as const, secure: new URL(siteUrl).protocol === "https:" };
}
