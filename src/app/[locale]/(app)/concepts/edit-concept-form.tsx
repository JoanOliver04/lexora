"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";
import type { Concept } from "@/modules/library/domain/concept";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { updateConceptAction, type ConceptFormState } from "./actions";
import { ConceptFields } from "./concept-fields";
import { conceptIssueKey } from "./message-key";

const ERROR_ID = "edit-concept-error";

/**
 * Edición de un concepto. El `id` viaja en un campo oculto: es un `update`
 * sobre el mismo `id`, nunca un alta nueva (misma identidad conservada que
 * `EditDeckForm`, LEX-3.5). En éxito la Server Action redirige a la lista.
 */
export function EditConceptForm({ locale, concept }: { locale: string; concept: Concept }) {
  const t = useTranslations("Concepts");
  const [state, action] = useActionState<ConceptFormState, FormData>(updateConceptAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const issues = state.issues ?? [];

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conceptId" value={concept.id} />

      {issues.length > 0 || state.error ? (
        <FormError id={ERROR_ID}>
          {state.error ? <p>{t("genericError")}</p> : null}
          {issues.map((issue) => (
            <p key={issue}>{t(`errors.${conceptIssueKey(issue)}`)}</p>
          ))}
        </FormError>
      ) : null}

      <ConceptFields
        issues={issues}
        errorId={ERROR_ID}
        defaults={{
          kind: concept.kind,
          title: concept.title,
          summary: concept.summary,
          explanation: concept.explanation,
          example: concept.example,
          cefrLevel: concept.cefrLevel,
          sourceReference: concept.sourceReference,
        }}
      />

      <PendingButton idle={t("actions.save")} pending={t("actions.saving")} />
    </form>
  );
}
