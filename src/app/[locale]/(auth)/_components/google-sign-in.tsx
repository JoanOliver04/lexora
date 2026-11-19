"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Google_Sans } from "next/font/google";
import { FormError } from "@/shared/presentation/components";
import { googleLoginAction, type AuthFormState } from "../actions";

const googleSans = Google_Sans({
  subsets: ["latin"],
  weight: "500",
  display: "swap",
  adjustFontFallback: false,
});

export function GoogleSignIn({ locale, next }: { locale: string; next?: string | undefined }) {
  const t = useTranslations("Auth");
  const [state, action, pending] = useActionState<AuthFormState, FormData>(googleLoginAction, {});
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <form action={action} className="flex min-w-0 flex-col gap-3">
        <input type="hidden" name="locale" value={locale} />
        {next && <input type="hidden" name="next" value={next} />}
        {state.error && (
          <FormError id="google-sign-in-error">
            <p>{t(`errors.${state.error}`)}</p>
          </FormError>
        )}
        <button
          type="submit"
          disabled={pending}
          className={`google-sign-in-button ${googleSans.className}`}
        >
          {/* The provider mark is a pre-sized local asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/google-g.png"
            alt=""
            width={20}
            height={20}
            style={{ objectFit: "contain" }}
            decoding="async"
          />
          <span>{t(pending ? "google.pending" : "google.continue")}</span>
        </button>
      </form>
      <p className="text-xs leading-relaxed text-(--color-ink-muted)">{t("google.personalHint")}</p>
      <p className="text-center text-sm text-(--color-ink-muted)">{t("google.orEmail")}</p>
    </div>
  );
}
