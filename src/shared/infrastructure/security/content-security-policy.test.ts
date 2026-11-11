import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, createCspNonce } from "./content-security-policy";

const inputs = {
  nonce: "A".repeat(32),
  backendUrl: "https://project.supabase.co/path?ignored=1",
  siteUrl: "https://lexora.example",
  development: false,
};
describe("Response CSP", () => {
  it("uses independent 192-bit random nonces and permits no inline/eval scripts in production", () => {
    const nonces = Array.from({ length: 50 }, createCspNonce);
    expect(new Set(nonces).size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{32}$/);
    const policy = contentSecurityPolicy(inputs);
    const scripts = policy.split(";").find((value) => value.trim().startsWith("script-src "))!;
    expect(scripts).toContain("'nonce-" + inputs.nonce + "'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(policy).toContain("connect-src 'self' https://project.supabase.co;");
    expect(policy).not.toContain("ignored");
    for (const directive of [
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "worker-src 'self'",
    ])
      expect(policy).toContain(directive);
    expect(policy).toContain("upgrade-insecure-requests");
  });
  it("keeps local HTTP usable and isolates eval permission to actual development", () => {
    expect(contentSecurityPolicy({ ...inputs, siteUrl: "http://localhost:3100" })).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(contentSecurityPolicy({ ...inputs, development: true })).toContain("'unsafe-eval'");
  });
  it("rejects a nonce/header injection and unsupported backend schemes", () => {
    expect(() => contentSecurityPolicy({ ...inputs, nonce: "'; script-src *" })).toThrow();
    expect(() =>
      contentSecurityPolicy({ ...inputs, backendUrl: "data:text/plain,hello" }),
    ).toThrow();
  });
});
