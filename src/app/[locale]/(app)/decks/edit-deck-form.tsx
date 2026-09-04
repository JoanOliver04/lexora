"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";
import type { Deck } from "@/modules/library/domain/deck";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { updateDeckAction, type DeckFormState } from "./actions";
import { DeckFields } from "./deck-fields";
import { deckIssueKey } from "./message-key";

const ERROR_ID = "edit-deck-error";

/**
 * Edición de un mazo. Los campos vienen rellenos con el mazo persistido; el
 * `id` viaja en un campo oculto. La edición conserva la identidad (mismo `id`):
 * es un `update`, nunca un alta nueva. En éxito la Server Action redirige a la
 * lista.
 */
export function EditDeckForm({ locale, deck }: { locale: string; deck: Deck }) {
  const t = useTranslations("Library");
  const [state, action] = useActionState<DeckFormState, FormData>(updateDeckAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const issues = state.issues ?? [];

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="deckId" value={deck.id} />

      {issues.length > 0 || state.error ? (
        <FormError id={ERROR_ID}>
          {state.error ? <p>{t("genericError")}</p> : null}
          {issues.map((issue) => (
            <p key={issue}>{t(`errors.${deckIssueKey(issue)}`)}</p>
          ))}
        </FormError>
      ) : null}

      <DeckFields
        issues={issues}
        errorId={ERROR_ID}
        defaults={{
          title: deck.title,
          description: deck.description,
          cefrLevel: deck.cefrLevel,
          category: deck.category,
        }}
      />

      <PendingButton idle={t("actions.save")} pending={t("actions.saving")} />
    </form>
  );
}
