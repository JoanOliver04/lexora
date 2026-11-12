// @vitest-environment node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "vitest";

function listTests(url: string) {
  return spawnSync(
    process.execPath,
    [
      resolve("node_modules/@playwright/test/cli.js"),
      "test",
      "--config",
      "playwright.compat.config.ts",
      "--list",
    ],
    {
      encoding: "utf8",
      timeout: 20_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_fixture",
        LEXORA_E2E_PORT: "3100",
      },
    },
  );
}

for (const url of [
  "https://example.invalid",
  "http://localhost.example.invalid:54321",
  "http://127.0.0.1:3000",
]) {
  test(`rejects an unsafe backend during configuration, before any test can run: ${url}`, () => {
    // --list never launches the app or makes Auth requests, including on the old code.
    const result = listTests(url);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "E2E requires local Supabase at loopback:54321",
    );
  });
}

test("valid local configuration still collects the real compatibility cases", () => {
  const result = listTests("http://127.0.0.1:54321");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("browser-compat.spec.ts");
});
