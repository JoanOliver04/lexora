// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { localBackend } from "../../e2e/local-backend";

vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
  vi.mocked(readFileSync).mockReturnValue(
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n" +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_file\n" +
      "LEXORA_ALLOW_REGISTRATION=false\n",
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

test("URL from shell and key from file resolve together without changing flags", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("LEXORA_ALLOW_REGISTRATION", "true");
  expect(localBackend()).toEqual({
    url: "http://localhost:54321",
    publishableKey: "sb_publishable_file",
  });
  expect(process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]).toBeUndefined();
  expect(process.env["LEXORA_ALLOW_REGISTRATION"]).toBe("true");
});

test("key from shell and URL from file resolve together", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_shell");
  expect(localBackend()).toEqual({
    url: "http://127.0.0.1:54321",
    publishableKey: "sb_publishable_shell",
  });
  expect(process.env["NEXT_PUBLIC_SUPABASE_URL"]).toBeUndefined();
});

test("a local file cannot mask an explicitly remote shell URL", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
  expect(() => localBackend()).toThrow("E2E requires local Supabase at loopback:54321");
});

test("complete shell configuration does not read any env file", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_shell");
  expect(localBackend().publishableKey).toBe("sb_publishable_shell");
  expect(readFileSync).not.toHaveBeenCalled();
});

test("missing local credentials fail with no file contents in the error", () => {
  vi.mocked(readFileSync).mockImplementation(() => {
    throw new Error("private file detail");
  });
  expect(() => localBackend()).toThrow(
    "E2E requires local Supabase at loopback:54321 and a public client key",
  );
});
