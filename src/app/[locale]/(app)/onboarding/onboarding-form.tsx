"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { CEFR_LEVELS } from "@/modules/courses/domain/onboarding";
import { Input, Label } from "@/shared/presentation/components";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { onboardingAction, type OnboardingFormState } from "./actions";
import { issueMessageKey } from "./message-key";

const UI_LOCALE_OPTIONS = ["es", "en"] as const;

export function OnboardingForm({ locale }: { locale: string }) {
  const t = useTranslations("Onboarding");
  const [state, action] = useActionState<OnboardingFormState, FormData>(onboardingAction, {});

  const issues = state.issues ?? [];
  // `aria-invalid` solo en el campo de número, donde tiene efecto (el `Input`
  // pinta el borde de error). El resaltado de los grupos de radio inválidos es
  // LEX-2.10; hoy el bloque `role="alert"` de arriba enumera todas las pegas.
  const limitInvalid = issues.some((issue) => issue.startsWith("onboarding.dailyNewLimit"));

  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {issues.length > 0 || state.error ? (
        <div role="alert" className="flex flex-col gap-1 text-sm text-(--color-danger)">
          {state.error ? <p>{t("genericError")}</p> : null}
          {issues.map((issue) => (
            <p key={issue}>{t(`errors.${issueMessageKey(issue)}`)}</p>
          ))}
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("uiLocaleLabel")}</legend>
        <div className="flex flex-wrap gap-4">
          {UI_LOCALE_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="radio"
                name="uiLocale"
                value={option}
                defaultChecked={option === locale}
                required
              />
              {t(option === "es" ? "uiLocaleEs" : "uiLocaleEn")}
            </label>
          ))}
        </div>
      </fieldset>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-(--color-ink-muted)">{t("supportLabel")}</dt>
          <dd>{t("supportValue")}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-(--color-ink-muted)">{t("targetLabel")}</dt>
          <dd>{t("targetValue")}</dd>
        </div>
      </dl>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("declaredLevelLabel")}</legend>
        <div className="flex flex-col gap-2">
          {CEFR_LEVELS.map((level) => (
            <label key={level} className="flex items-center gap-2">
              <input type="radio" name="declaredLevel" value={level} required />
              {t(`level${level}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-(--color-ink-subtle)">{t("declaredLevelNote")}</p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("startLevelLabel")}</legend>
        <div className="flex flex-col gap-2">
          {CEFR_LEVELS.map((level) => (
            <label key={level} className="flex items-center gap-2">
              <input
                type="radio"
                name="startLevel"
                value={level}
                defaultChecked={level === "A1"}
                required
              />
              {t(`level${level}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-(--color-ink-subtle)">{t("startLevelHint")}</p>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dailyNewLimit">{t("dailyNewLimitLabel")}</Label>
        <Input
          id="dailyNewLimit"
          name="dailyNewLimit"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          defaultValue={5}
          required
          aria-invalid={limitInvalid || undefined}
          aria-describedby="dailyNewLimit-hint"
          className="max-w-28"
        />
        <p id="dailyNewLimit-hint" className="text-xs text-(--color-ink-subtle)">
          {t("dailyNewLimitHint")}
        </p>
      </div>

      <PendingButton idle={t("submit")} pending={t("submitting")} />
    </form>
  );
}
