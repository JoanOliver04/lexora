"use client";

import { useTranslations } from "next-intl";

import { Input, Label } from "@/shared/presentation/components";
import type { PracticeItemIssue } from "@/modules/library/domain/practice-item";
import { V1_PRACTICE_MODES } from "@/modules/library/domain/taxonomy";

import { practiceItemIssueKey } from "./message-key";

/**
 * Campos de un ítem de práctica, compartidos entre alta y edición. Mismo
 * patrón que `concept-fields.tsx` / `deck-fields.tsx`.
 *
 * El `<select>` de modo ofrece **solo `V1_PRACTICE_MODES`** (los tres
 * activables en la V1), no los siete reservados de `PRACTICE_MODES`: no basta
 * con confiar en que `validatePracticeItemDraft` rechace los demás con
 * `mode.notAvailableInV1`, la interfaz no debe ni ofrecerlos como opción.
 *
 * `clozeAnswers` es una `<textarea>` de una solución por línea; solo se
 * envía como `config.answers` cuando el modo elegido es `cloze`
 * (`practiceItemActionDraft` en `actions.ts` decide la forma final). El campo
 * se muestra siempre —sin JS que lo oculte según el modo— con una nota de
 * cuándo se usa: mismo principio que las pantallas de mazo/concepto, sin
 * estado de cliente para mostrar/ocultar.
 */

const CONTROL_CLASS = [
  "w-full rounded-(--radius-control) px-3 min-h-11",
  "border border-(--color-border-strong)",
  "bg-(--color-surface) text-(--color-ink)",
  "placeholder:text-(--color-ink-subtle)",
  "aria-invalid:border-(--color-danger)",
  "disabled:opacity-50",
].join(" ");

export interface PracticeItemFieldDefaults {
  mode?: string;
  promptText?: string;
  answerText?: string;
  hintText?: string | null;
  clozeAnswers?: string;
}

export function PracticeItemFields({
  issues,
  errorId,
  defaults = {},
}: {
  issues: PracticeItemIssue[];
  errorId: string;
  defaults?: PracticeItemFieldDefaults;
}) {
  const t = useTranslations("Concepts");
  const keys = issues.map(practiceItemIssueKey);
  const modeInvalid = keys.some((key) => key.startsWith("mode"));
  const promptInvalid = keys.some((key) => key.startsWith("promptText"));
  const answerInvalid = keys.some((key) => key.startsWith("answerText"));
  const hintInvalid = keys.some((key) => key.startsWith("hintText"));
  const configInvalid = keys.some((key) => key.startsWith("config"));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="item-mode">{t("items.fields.modeLabel")}</Label>
        <select
          id="item-mode"
          name="mode"
          required
          defaultValue={defaults.mode ?? V1_PRACTICE_MODES[0]}
          aria-invalid={modeInvalid || undefined}
          aria-describedby={modeInvalid ? errorId : undefined}
          className={CONTROL_CLASS}
        >
          {V1_PRACTICE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`items.modes.${mode}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="item-promptText">{t("items.fields.promptLabel")}</Label>
        <Input
          id="item-promptText"
          name="promptText"
          type="text"
          required
          maxLength={4000}
          defaultValue={defaults.promptText ?? ""}
          aria-invalid={promptInvalid || undefined}
          aria-describedby={promptInvalid ? errorId : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="item-answerText">{t("items.fields.answerLabel")}</Label>
        <Input
          id="item-answerText"
          name="answerText"
          type="text"
          required
          maxLength={500}
          defaultValue={defaults.answerText ?? ""}
          aria-invalid={answerInvalid || undefined}
          aria-describedby={answerInvalid ? errorId : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="item-hintText">{t("items.fields.hintLabel")}</Label>
        <Input
          id="item-hintText"
          name="hintText"
          type="text"
          maxLength={500}
          defaultValue={defaults.hintText ?? ""}
          aria-invalid={hintInvalid || undefined}
          aria-describedby={hintInvalid ? errorId : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="item-clozeAnswers">{t("items.fields.clozeAnswersLabel")}</Label>
        <textarea
          id="item-clozeAnswers"
          name="clozeAnswers"
          rows={3}
          defaultValue={defaults.clozeAnswers ?? ""}
          aria-invalid={configInvalid || undefined}
          aria-describedby={configInvalid ? errorId : "item-clozeAnswers-hint"}
          className={`${CONTROL_CLASS} py-2`}
        />
        <p id="item-clozeAnswers-hint" className="text-xs text-(--color-ink-subtle)">
          {t("items.fields.clozeAnswersHint")}
        </p>
      </div>
    </div>
  );
}
