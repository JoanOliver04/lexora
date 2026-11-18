"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, type RefObject } from "react";

import type { DeckIssue } from "@/modules/library/domain/deck";
import { Button, FormError } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { DeckFields, type DeckFieldDefaults } from "../decks/deck-fields";
import { fieldValuesFromForm } from "../decks/deck-form-data";
import { deckIssueKey } from "../decks/message-key";
import { createImportDeck } from "./deck-options-action";

const ERROR_ID = "import-new-deck-error";

type DeckCreationState = {
  issues?: DeckIssue[];
  error?: "deckCreateFailed";
  values?: DeckFieldDefaults;
};

export function ImportCreateDeckDialog({
  courseId,
  dialog,
  onCreated,
}: {
  courseId: string;
  dialog: RefObject<HTMLDialogElement | null>;
  onCreated: (deck: { id: string; title: string }) => void;
}) {
  const t = useTranslations("Import.execute");
  const tDeckErrors = useTranslations("Library.errors");
  const form = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState<DeckCreationState, FormData>(async (_, data) => {
    const values = fieldValuesFromForm(data);
    try {
      const result = await createImportDeck(courseId, data);
      if (!result.ok) {
        return result.issues
          ? { issues: result.issues, values }
          : { error: "deckCreateFailed", values };
      }

      dialog.current?.close();
      onCreated(result.deck);
      return {};
    } catch {
      return { error: "deckCreateFailed", values };
    }
  }, {});
  useFocusFirstInvalid(form, state);
  const issues = state.issues ?? [];

  return (
    <dialog
      ref={dialog}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-auto rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 text-(--color-ink) backdrop:bg-black/50"
      aria-labelledby="import-create-deck-title"
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      <form action={submit} ref={form} noValidate className="flex min-w-0 flex-col gap-4">
        <h2 id="import-create-deck-title" className="text-lg font-semibold">
          {t("createDeck")}
        </h2>
        <fieldset
          aria-labelledby="import-create-deck-title"
          disabled={pending}
          className="flex min-w-0 flex-col gap-4"
        >
          {issues.length > 0 || state.error ? (
            <FormError id={ERROR_ID}>
              {state.error ? <p>{t(state.error)}</p> : null}
              {issues.map((issue) => (
                <p key={issue}>{tDeckErrors(deckIssueKey(issue))}</p>
              ))}
            </FormError>
          ) : null}
          <DeckFields
            titleLabel={t("deckTitle")}
            issues={issues}
            errorId={ERROR_ID}
            {...(state.values ? { defaults: state.values } : {})}
          />
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {t(pending ? "creatingDeck" : "createDeck")}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => dialog.current?.close()}>
            {t("cancelDeck")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
