"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, useState, type RefObject } from "react";

import { TITLE_MAX_LENGTH } from "@/modules/library/domain/taxonomy";
import { Button, FormError, Input, Label } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { createImportDeck } from "./deck-options-action";

type DeckCreationState = { error?: "deckTitleRequired" | "deckTitleLong" | "deckCreateFailed" };

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
  const form = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState("");
  const [state, submit, pending] = useActionState<DeckCreationState, FormData>(async (_, data) => {
    try {
      const result = await createImportDeck(courseId, data.get("title"));
      if (!result.ok) return { error: result.error };

      dialog.current?.close();
      onCreated(result.deck);
      return {};
    } catch {
      return { error: "deckCreateFailed" };
    }
  }, {});
  useFocusFirstInvalid(form, state);
  const invalidTitle = state.error === "deckTitleRequired" || state.error === "deckTitleLong";

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
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="import-new-deck-name">{t("deckTitle")}</Label>
          <Input
            id="import-new-deck-name"
            name="title"
            required
            maxLength={TITLE_MAX_LENGTH}
            value={title}
            readOnly={pending}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={invalidTitle || undefined}
            aria-describedby={invalidTitle ? "import-new-deck-error" : undefined}
          />
          {state.error ? (
            <FormError id="import-new-deck-error">
              <p>{t(state.error)}</p>
            </FormError>
          ) : null}
        </div>
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
