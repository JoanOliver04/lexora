"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { createPracticeItemAction, type PracticeItemFormState } from "./actions";
import { practiceItemIssueKey } from "./message-key";
import { PracticeItemFields } from "./practice-item-fields";

const ERROR_ID = "create-practice-item-error";

/** Alta de un ítem de práctica. Mismo patrón que `CreateConceptForm`. */
export function CreatePracticeItemForm({
  locale,
  conceptId,
}: {
  locale: string;
  conceptId: string;
}) {
  const t = useTranslations("Concepts");
  const [state, action] = useActionState<PracticeItemFormState, FormData>(
    createPracticeItemAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const issues = state.issues ?? [];

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conceptId" value={conceptId} />

      {issues.length > 0 || state.error ? (
        <FormError id={ERROR_ID}>
          {state.error ? <p>{t("items.genericError")}</p> : null}
          {issues.map((issue) => (
            <p key={issue}>{t(`items.errors.${practiceItemIssueKey(issue)}`)}</p>
          ))}
        </FormError>
      ) : null}

      <PracticeItemFields issues={issues} errorId={ERROR_ID} />

      <PendingButton idle={t("items.actions.create")} pending={t("items.actions.creating")} />
    </form>
  );
}
