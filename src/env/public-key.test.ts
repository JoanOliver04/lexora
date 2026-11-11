import { describe, expect, it } from "vitest";
import { isPublicSupabaseKey } from "./public-key";
function legacy(role: string) {
  return "header." + Buffer.from(JSON.stringify({ role })).toString("base64url") + ".signature";
}
describe("Public Supabase configuration key", () => {
  it("accepts publishable keys and legacy anon role keys", () => {
    expect(isPublicSupabaseKey("sb_publishable_synthetic_local")).toBe(true);
    expect(isPublicSupabaseKey(legacy("anon"))).toBe(true);
  });
  it("rejects privileged keys, user JWTs and malformed configuration before bundling", () => {
    for (const key of [
      "sb_secret_synthetic_not_real",
      legacy("service_role"),
      legacy("authenticated"),
      "not-a-key",
      "header.invalid.signature",
    ])
      expect(isPublicSupabaseKey(key)).toBe(false);
  });
});
