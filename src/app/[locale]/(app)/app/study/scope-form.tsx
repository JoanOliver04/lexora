"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";

import type { StudyScope } from "@/modules/study/application/study-session";
import type { DashboardDeck } from "@/modules/study/application/today-dashboard";
import { Button, FormError } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { createStudySessionAction, type StudySessionFormState } from "./actions";
import { StudyDeckPicker } from "./study-deck-picker";

export function ScopeForm({
  locale,
  courseId,
  sessionId,
  decks,
  initialScope,
  availableCount,
}: {
  locale: string;
  courseId: string;
  sessionId: string;
  decks: DashboardDeck[];
  initialScope: StudyScope;
  availableCount: number;
}) {
  const t = useTranslations("StudySession");
  const [state, action, pending] = useActionState<StudySessionFormState, FormData>(
    createStudySessionAction,
    {},
  );
  const [mode, setMode] = useState(initialScope.deckIds === null ? "all" : "selected");
  const [selected, setSelected] = useState(initialScope.deckIds ?? []);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    // React resets action forms during commit, when its event dispatch is paused.
    // A native listener keeps the submitted intent intact after a failed write.
    const preserveSelection = (event: Event) => event.preventDefault();
    form.addEventListener("reset", preserveSelection);
    return () => form.removeEventListener("reset", preserveSelection);
  }, []);
  useFocusFirstInvalid(ref, state);
  const invalidScope = state.error === "invalid-scope";
  return (
    <form ref={ref} action={action} noValidate className="flex min-w-0 flex-col gap-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="expectedCourseId" value={courseId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="deckIds" value={id} />
      ))}
      {state.error && (
        <FormError id="study-scope-error">
          <p>{t(`errors.${state.error}`)}</p>
        </FormError>
      )}
      <fieldset disabled={pending} className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">{t("scopeLabel")}</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="radio"
            name="scopeMode"
            value="all"
            checked={mode === "all"}
            onChange={() => setMode("all")}
          />
          {t("allDecks")}
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="radio"
            name="scopeMode"
            value="selected"
            checked={mode === "selected"}
            onChange={() => setMode("selected")}
          />
          {t("selectedDecks")}
        </label>
      </fieldset>
      <fieldset
        disabled={pending}
        aria-invalid={invalidScope || undefined}
        aria-describedby={invalidScope ? "study-scope-error study-deck-hint" : "study-deck-hint"}
        tabIndex={invalidScope ? -1 : undefined}
        className="flex min-w-0 flex-col gap-2"
      >
        <legend className="mb-2 font-medium">{t("deckList")}</legend>
        <p id="study-deck-hint" className="mb-2 text-sm leading-relaxed text-(--color-ink-muted)">
          {t("deckHint")}
        </p>
        {decks.length > 0 ? (
          <StudyDeckPicker
            decks={decks}
            selected={selected}
            onSelectionChange={(selection) => {
              setMode("selected");
              setSelected(selection);
            }}
          />
        ) : (
          <p className="text-sm text-(--color-ink-muted)">{t("emptyDecks")}</p>
        )}
      </fieldset>
      {availableCount === 0 && (
        <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("noAvailable")}</p>
      )}
      <Button
        type="submit"
        disabled={pending || availableCount === 0}
        className="min-h-12 w-full sm:w-auto"
      >
        {t(pending ? "creating" : "create")}
      </Button>
    </form>
  );
}
