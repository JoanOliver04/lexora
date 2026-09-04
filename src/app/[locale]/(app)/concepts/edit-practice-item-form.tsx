"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";
import type { PracticeItem } from "@/modules/library/domain/practice-item";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { updatePracticeItemAction, type PracticeItemFormState } from "./actions";
import { practiceItemIssueKey } from "./message-key";
import { PracticeItemFields } from "./practice-item-fields";

const ERROR_ID = "edit-practice-item-error";

/**
 * Edición de un ítem de práctica. El `id` viaja en un campo oculto: es un
 * `update` sobre el mismo `id`, nunca un alta nueva. En éxito la Server Action
 * redirige al detalle del concepto.
 */
export function EditPracticeItemForm({
  locale,
  conceptId,
  item,
}: {
  locale: string;
  conceptId: string;
  item: PracticeItem;
}) {
  const t = useTranslations("Concepts");
  const [state, action] = useActionState<PracticeItemFormState, FormData>(
    updatePracticeItemAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const issues = state.issues ?? [];
  const clozeAnswers = item.config.mode === "cloze" ? item.config.answers.join("\n") : "";

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conceptId" value={conceptId} />
      <input type="hidden" name="itemId" value={item.id} />

      {issues.length > 0 || state.error ? (
        <FormError id={ERROR_ID}>
          {state.error ? <p>{t("items.genericError")}</p> : null}
          {issues.map((issue) => (
            <p key={issue}>{t(`items.errors.${practiceItemIssueKey(issue)}`)}</p>
          ))}
        </FormError>
      ) : null}

      <PracticeItemFields
        issues={issues}
        errorId={ERROR_ID}
        defaults={{
          mode: item.mode,
          promptText: item.promptText,
          answerText: item.answerText,
          hintText: item.hintText,
          clozeAnswers,
        }}
      />

      <PendingButton idle={t("items.actions.save")} pending={t("items.actions.saving")} />
    </form>
  );
}
