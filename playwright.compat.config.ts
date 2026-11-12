import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Basic critical-flow coverage in other engines; physical acceptance is separate. */
export default defineConfig({
  ...base,
  testMatch: "**/browser-compat.spec.ts",
  projects: [
    { name: "firefox-claro", use: { browserName: "firefox", colorScheme: "light" } },
    { name: "firefox-oscuro", use: { browserName: "firefox", colorScheme: "dark" } },
    { name: "webkit-claro", use: { browserName: "webkit", colorScheme: "light" } },
    { name: "webkit-oscuro", use: { browserName: "webkit", colorScheme: "dark" } },
  ],
});
