import { describe, expect, it } from "vitest";
import { supabaseCookieOptions } from "./cookie-options";
describe("Supabase cookie transport", () => {
  it("keeps session cookies out of JavaScript in HTTPS and local HTTP", () => {
    expect(supabaseCookieOptions("https://lexora.example")).toEqual({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
    expect(supabaseCookieOptions("http://localhost:3100")).toEqual({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
  });
});
