import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const server = base.webServer;
if (!server || Array.isArray(server)) throw new Error("Personal access needs one isolated server");

/** Separate closed-mode build: ordinary suites still create local synthetic accounts. */
export default defineConfig({
  ...base,
  testMatch: "**/personal-access.spec.ts",
  testIgnore: [],
  webServer: {
    ...server,
    env: {
      ...server.env,
      LEXORA_ALLOW_REGISTRATION: "false",
    },
  },
});
