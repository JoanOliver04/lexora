"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { CEFR_LEVELS } from "@/modules/courses/domain/onboarding";
import { FormError, Input, Label } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { onboardingAction, type OnboardingFormState } from "./actions";
import { issueMessageKey } from "./message-key";

const UI_LOCALE_OPTIONS = ["es", "en"] as const;
const ERROR_ID = "onboarding-error";

export function OnboardingForm({ locale }: { locale: string }) {
  const t = useTranslations("Onboarding");
  const [state, action] = useActionState<OnboardingFormState, FormData>(onboardingAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const issues = state.issues ?? [];
  const uiLocaleInvalid = issues.includes("onboarding.uiLocale.invalid");
  const declaredLevelInvalid = issues.includes("onboarding.declaredLevel.invalid");
  const startLevelInvalid = issues.includes("onboarding.startLevel.invalid");
  const limitInvalid = issues.some((issue) => issue.startsWith("onboarding.dailyNewLimit"));

  // Un grupo de radios inválido: `<fieldset>` con `aria-invalid` y
  // `aria-describedby` a la región de error, `tabIndex={-1}` para que
  // `useFocusFirstInvalid` pueda llevarle el foco, y la leyenda en color de
  // error como pista visible. El detalle del mensaje sigue en el `role="alert"`.
  function groupProps(invalid: boolean) {
    return invalid
      ? ({
          "aria-invalid": true,
          "aria-describedby": ERROR_ID,
          tabIndex: -1,
        } as const)
      : {};
  }

  function legendClass(invalid: boolean): string {
    return invalid ? "text-sm font-medium text-(--color-danger)" : "text-sm font-medium";
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {issues.length > 0 || state.error ? (
        <FormError id={ERROR_ID}>
          {state.error ? <p>{t("genericError")}</p> : null}
          {issues.map((issue) => (
            <p key={issue}>{t(`errors.${issueMessageKey(issue)}`)}</p>
          ))}
        </FormError>
      ) : null}

      <fieldset className="flex flex-col gap-3" {...groupProps(uiLocaleInvalid)}>
        <legend className={legendClass(uiLocaleInvalid)}>{t("uiLocaleLabel")}</legend>
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

      <fieldset className="flex flex-col gap-3" {...groupProps(declaredLevelInvalid)}>
        <legend className={legendClass(declaredLevelInvalid)}>{t("declaredLevelLabel")}</legend>
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

      <fieldset className="flex flex-col gap-3" {...groupProps(startLevelInvalid)}>
        <legend className={legendClass(startLevelInvalid)}>{t("startLevelLabel")}</legend>
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
          aria-describedby={limitInvalid ? `${ERROR_ID} dailyNewLimit-hint` : "dailyNewLimit-hint"}
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
