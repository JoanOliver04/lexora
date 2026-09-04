"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { createConceptAction, type ConceptFormState } from "./actions";
import { ConceptFields } from "./concept-fields";
import { conceptIssueKey } from "./message-key";

const ERROR_ID = "create-concept-error";

/** Alta de un concepto. Mismo patrón que `CreateDeckForm` (LEX-3.5). */
export function CreateConceptForm({ locale }: { locale: string }) {
  const t = useTranslations("Concepts");
  const [state, action] = useActionState<ConceptFormState, FormData>(createConceptAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const issues = state.issues ?? [];

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {issues.length > 0 || state.error ? (
        <FormError id={ERROR_ID}>
          {state.error ? <p>{t("genericError")}</p> : null}
          {issues.map((issue) => (
            <p key={issue}>{t(`errors.${conceptIssueKey(issue)}`)}</p>
          ))}
        </FormError>
      ) : null}

      <ConceptFields issues={issues} errorId={ERROR_ID} />

      <PendingButton idle={t("actions.create")} pending={t("actions.creating")} />
    </form>
  );
}
