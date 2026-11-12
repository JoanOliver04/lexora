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
  returnQuery = "",
}: {
  locale: string;
  conceptId: string;
  returnQuery?: string;
}) {
  const t = useTranslations("Concepts");
  const [state, action, pending] = useActionState<PracticeItemFormState, FormData>(
    createPracticeItemAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const issues = state.issues ?? [];

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      <fieldset
        disabled={pending}
        aria-label={t("items.actions.create")}
        className="flex min-w-0 flex-col gap-4"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="conceptId" value={conceptId} />
        <input type="hidden" name="returnQuery" value={returnQuery} />

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
          {...(state.values ? { defaults: state.values } : {})}
        />

        <PendingButton idle={t("items.actions.create")} pending={t("items.actions.creating")} />
      </fieldset>
    </form>
  );
}
