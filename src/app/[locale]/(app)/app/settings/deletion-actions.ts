"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientEnv } from "@/env/client";
import { signInGoogleVisitor } from "@/composition/identity";
import {
  beginDeletionGoogleChallenge,
  resumeCurrentAccountDeletion,
} from "@/composition/account-deletion";

export async function startGoogleDeletionAction(rawLocale: string) {
  const locale = rawLocale === "en" ? "en" : "es";
  const nonce = await beginDeletionGoogleChallenge();
  if (!nonce) redirect(`/${locale}/app/settings?verification=failed`);
  const callback = new URL("/api/auth/callback", clientEnv.NEXT_PUBLIC_SITE_URL);
  callback.searchParams.set("flow", "deletion-google");
  callback.searchParams.set("locale", locale);
  const login = await signInGoogleVisitor(callback.toString());
  if (!login.ok) redirect(`/${locale}/app/settings?verification=failed`);
  (await cookies()).set("lexora-deletion-google", nonce, {
    httpOnly: true,
    secure: callback.protocol === "https:",
    sameSite: "lax",
    maxAge: 300,
    path: "/api/auth/callback",
  });
  redirect(login.url);
}

export async function resumeAccountDeletionAction(rawLocale: string) {
  const locale = rawLocale === "en" ? "en" : "es";
  const result = await resumeCurrentAccountDeletion();
  if (result.ok || result.error === "unauthenticated") {
    redirect(result.ok ? `/${locale}/login?deleted=1` : `/${locale}/login`);
  }
  return true;
}
