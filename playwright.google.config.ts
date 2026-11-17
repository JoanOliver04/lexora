import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const server = base.webServer;
if (!server || Array.isArray(server)) throw new Error("Google access needs one isolated server");

/** Exercise the SDK/PKCE initiation locally without Google credentials or real identities. */
export default defineConfig({
  ...base,
  testMatch: "**/google-sign-in.spec.ts",
  testIgnore: [],
  projects: [
    ...base.projects!,
    { name: "google-firefox", use: { browserName: "firefox" } },
    { name: "google-webkit", use: { browserName: "webkit", colorScheme: "dark" } },
  ],
  webServer: {
    ...server,
    env: {
      ...server.env,
      LEXORA_ALLOW_REGISTRATION: "false",
      LEXORA_GOOGLE_AUTH: "enabled",
    },
  },
});
