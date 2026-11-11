"use client";
import { useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, FormError, Input, Label } from "@/shared/presentation/components";
import type {
  AccountDeletionFailure,
  AccountDeletionFactors,
  AccountDeletionResult,
} from "@/modules/data-management/application/delete-account";

export function DeleteAccountForm({ factors }: { factors: AccountDeletionFactors | null }) {
  const t = useTranslations("AccountDeletion"),
    locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AccountDeletionFailure | "uncertain" | null>(null);
  const busy = useRef(false),
    feedback = useRef<HTMLDivElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget,
      data = new FormData(form);
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
          confirmation: data.get("confirmation"),
          acknowledged: data.get("acknowledged") === "on",
          ...(data.get("otp") ? { otp: data.get("otp") } : {}),
          ...(data.get("factorId") ? { factorId: data.get("factorId") } : {}),
        }),
      });
      const result = (await response.json()) as AccountDeletionResult;
      if (response.ok && result.ok) {
        window.location.replace(`/${locale}/login?deleted=1`);
        return;
      }
      const allowed: AccountDeletionFailure[] = [
        "invalid-input",
        "invalid-credentials",
        "unauthenticated",
        "reauth-required",
        "mfa-required",
        "cooldown",
        "unavailable",
      ];
      setError(!result.ok && allowed.includes(result.error) ? result.error : "uncertain");
    } catch {
      // A transport failure may happen after commit. Do not claim the data is intact.
      setError("uncertain");
    } finally {
      for (const name of ["password", "otp"]) {
        const secret = form.elements.namedItem(name);
        if (secret instanceof HTMLInputElement) secret.value = "";
      }
      busy.current = false;
      setPending(false);
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }
  return (
    <section
      aria-labelledby="delete-title"
      className="min-w-0 wrap-anywhere rounded-(--radius-surface) border border-(--color-border-strong) p-5 sm:p-7"
    >
      <h2 id="delete-title" className="text-xl font-semibold">
        {t("title")}
      </h2>
      <p className="mt-3 leading-relaxed text-(--color-ink-muted)">{t("description")}</p>
      <details className="mt-4">
        <summary className="min-h-11 cursor-pointer py-3 font-medium underline underline-offset-4">
          {t("open")}
        </summary>
        <form onSubmit={submit} className="mt-4 flex min-w-0 flex-col gap-5">
          <p id="delete-warning" className="leading-relaxed">
            {t("warning")}
          </p>
          <div ref={feedback} tabIndex={-1}>
            {error && (
              <FormError id="delete-error">
                <p>{t(`errors.${error}`)}</p>
              </FormError>
            )}
          </div>
          {factors === null && (
            <div role="status" className="flex flex-col gap-3">
              <p>{t("factorLoadError")}</p>
              <Button onClick={() => router.refresh()} variant="secondary">
                {t("reloadFactors")}
              </Button>
            </div>
          )}
          {factors?.requiresMfa && !factors.factors.length && <p>{t("unsupportedFactor")}</p>}
          <fieldset
            disabled={
              pending || factors === null || (factors.requiresMfa && !factors.factors.length)
            }
            className="flex min-w-0 flex-col gap-5 border-0 p-0"
            aria-describedby="delete-warning"
          >
            <legend className="sr-only">{t("open")}</legend>
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-email">{t("email")}</Label>
              <Input
                id="delete-email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="username"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-password">{t("password")}</Label>
              <Input
                id="delete-password"
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="current-password"
              />
            </div>
            {factors && factors.factors.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="delete-factor">{t("factor")}</Label>
                <select
                  id="delete-factor"
                  name="factorId"
                  className="min-h-11 w-full min-w-0 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)"
                  required
                >
                  {factors.factors.map((factor, i) => (
                    <option key={factor.id} value={factor.id}>
                      {factor.label || t("factorUnnamed", { number: i + 1 })}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {factors?.requiresMfa && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="delete-otp">{t("otp")}</Label>
                <Input
                  id="delete-otp"
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-confirmation">{t("confirmation")}</Label>
              <Input
                id="delete-confirmation"
                name="confirmation"
                required
                pattern="DELETE"
                maxLength={6}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <label className="flex min-h-11 items-start gap-3 leading-relaxed">
              <input
                name="acknowledged"
                type="checkbox"
                required
                className="mt-1 h-5 w-5 shrink-0 accent-(--color-accent)"
              />
              <span className="min-w-0">{t("acknowledged")}</span>
            </label>
            <Button
              type="submit"
              variant="danger"
              className="w-full min-w-0 max-w-full whitespace-normal py-3 sm:w-auto sm:self-start"
            >
              {t(pending ? "deleting" : "submit")}
            </Button>
          </fieldset>
          {pending && <p role="status">{t("deleting")}</p>}
        </form>
      </details>
    </section>
  );
}
