import { describe, expect, it } from "vitest";
import { supabaseCookieOptions } from "./cookie-options";
describe("Supabase cookie transport", () => {
  it("sets Secure for canonical HTTPS and retains the SSR same-site contract", () => {
    expect(supabaseCookieOptions("https://lexora.example")).toEqual({
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(supabaseCookieOptions("http://localhost:3100")).toEqual({
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });
});
