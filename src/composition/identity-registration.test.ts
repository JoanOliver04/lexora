import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { createClient, serverEnv, clientEnv, privateBackendEnabled, getPrivacyContact } = vi.hoisted(
  () => ({
    createClient: vi.fn(),
    serverEnv: { NODE_ENV: "production", LEXORA_ALLOW_REGISTRATION: "false", VERCEL: "1" },
    clientEnv: {
      NEXT_PUBLIC_SITE_URL: "https://lexora.example",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-placeholder",
    },
    privateBackendEnabled: vi.fn(() => true),
    getPrivacyContact: vi.fn<() => { name: string; href: string } | null>(() => null),
  }),
);
vi.mock("@/env/deployment", () => ({ privateBackendEnabled }));
vi.mock("@/env/client", () => ({ clientEnv }));
vi.mock("@/env/server", () => ({
  serverEnv,
  getPrivacyContact,
}));
vi.mock("@/shared/infrastructure/supabase/server-client", () => ({
  createSupabaseServerClient: createClient,
}));
import { isRegistrationOpen, registerVisitor } from "./identity";
describe("Registration availability", () => {
  it("denies a direct action before creating an Auth client", async () => {
    expect(
      await registerVisitor(
        { email: "not-created@example.com", password: "synthetic-password" },
        "https://example.com/api/auth/callback",
      ),
    ).toEqual({ ok: false, error: "registration-closed" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires public contact information for hosted signup and preserves the preview gate", () => {
    serverEnv.LEXORA_ALLOW_REGISTRATION = "true";
    expect(isRegistrationOpen()).toBe(false);
    getPrivacyContact.mockReturnValueOnce({
      name: "Example controller",
      href: "https://example.com/contact",
    });
    expect(isRegistrationOpen()).toBe(true);
    privateBackendEnabled.mockReturnValueOnce(false);
    expect(isRegistrationOpen()).toBe(false);
  });

  it("permits synthetic registration against a local production build", () => {
    serverEnv.LEXORA_ALLOW_REGISTRATION = "true";
    serverEnv.VERCEL = "";
    clientEnv.NEXT_PUBLIC_SITE_URL = "http://localhost:3100";
    expect(isRegistrationOpen()).toBe(true);
  });
});
