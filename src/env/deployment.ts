import "server-only";

import { serverEnv } from "./server";

// Preview is deliberately unusable with the personal backend. Git previews also
// remain disabled; this covers manual deployments inheriting production env.
export function privateBackendEnabled(): boolean {
  return serverEnv.VERCEL_ENV !== "preview" && !(serverEnv.VERCEL === "1" && !serverEnv.VERCEL_ENV);
}

export class PreviewAccessError extends Error {
  constructor() {
    super("Private backend disabled for this deployment");
    this.name = "PreviewAccessError";
  }
}
