import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const server = base.webServer;
if (!server || Array.isArray(server)) throw new Error("Preview checks need one isolated server");
export default defineConfig({
  ...base,
  testMatch: "**/preview-access.spec.ts",
  testIgnore: [],
  webServer: {
    ...server,
    env: { ...server.env, VERCEL: "1", VERCEL_ENV: "preview", LEXORA_ALLOW_REGISTRATION: "true" },
  },
});
