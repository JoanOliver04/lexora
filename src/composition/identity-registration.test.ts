import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/env/deployment", () => ({ privateBackendEnabled: () => true }));
vi.mock("@/env/client", () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-placeholder",
  },
}));
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/env/server", () => ({
  serverEnv: { NODE_ENV: "production", LEXORA_ALLOW_REGISTRATION: "false" },
}));
vi.mock("@/shared/infrastructure/supabase/server-client", () => ({
  createSupabaseServerClient: createClient,
}));
import { registerVisitor } from "./identity";
describe("Closed personal registration", () => {
  it("denies a direct action before creating an Auth client", async () => {
    expect(
      await registerVisitor(
        { email: "not-created@example.com", password: "synthetic-password" },
        "https://example.com/api/auth/callback",
      ),
    ).toEqual({ ok: false, error: "registration-closed" });
    expect(createClient).not.toHaveBeenCalled();
  });
});
