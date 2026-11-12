import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/** Fail before starting an app/browser, even when a shell overrides .env.local. */
export function localBackend() {
  let fallback: Record<string, string | undefined> = {};
  if (
    !process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
    !process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
  ) {
    try {
      fallback = parseEnv(readFileSync(".env.local", "utf8"));
    } catch {
      throw new Error("E2E requires local Supabase at loopback:54321 and a public client key");
    }
  }
  let url: URL;
  try {
    url = new URL(
      process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? fallback["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
    );
  } catch {
    throw new Error("E2E requires local Supabase at loopback:54321");
  }
  if (
    !["http://localhost:54321", "http://127.0.0.1:54321"].includes(url.origin) ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("E2E requires local Supabase at loopback:54321");
  }
  const publishableKey =
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ??
    fallback["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!publishableKey?.trim()) throw new Error("E2E requires a public local client key");
  return { url: url.origin, publishableKey };
}
