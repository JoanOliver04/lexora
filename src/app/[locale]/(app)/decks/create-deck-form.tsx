"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { createDeckAction, type DeckFormState } from "./actions";
import { DeckFields } from "./deck-fields";
import { deckIssueKey } from "./message-key";

const ERROR_ID = "create-deck-error";

/**
 * Alta de un mazo. Mismo patrón que `OnboardingForm`: `useActionState`, región
 * de error `role="alert"`, foco al primer campo inválido tras un envío fallido.
 * En éxito la Server Action redirige a la lista.
 */
export function CreateDeckForm({ locale }: { locale: string }) {
  const t = useTranslations("Library");
  const [state, action] = useActionState<DeckFormState, FormData>(createDeckAction, {});
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
            <p key={issue}>{t(`errors.${deckIssueKey(issue)}`)}</p>
          ))}
        </FormError>
      ) : null}

      <DeckFields issues={issues} errorId={ERROR_ID} />

      <PendingButton idle={t("actions.create")} pending={t("actions.creating")} />
    </form>
  );
}
