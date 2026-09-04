"use client";

import { useTranslations } from "next-intl";

import { Input, Label } from "@/shared/presentation/components";
import type { DeckIssue } from "@/modules/library/domain/deck";
import { CEFR_LEVELS, DECK_CATEGORIES } from "@/modules/library/domain/taxonomy";

import { deckIssueKey } from "./message-key";

/**
 * Campos de un mazo, compartidos entre el alta y la edición. La `<textarea>` y
 * los `<select>` no tienen componente en `shared/` todavía; se estilan aquí con
 * los mismos tokens que `Input` para no adelantar una librería de formularios
 * que aún no hace falta.
 *
 * El borde de error acompaña al color pero no lo sustituye: el detalle textual
 * vive en el `role="alert"` del formulario, referenciado por `errorId`.
 */

const CONTROL_CLASS = [
  "w-full rounded-(--radius-control) px-3 min-h-11",
  "border border-(--color-border-strong)",
  "bg-(--color-surface) text-(--color-ink)",
  "placeholder:text-(--color-ink-subtle)",
  "aria-invalid:border-(--color-danger)",
  "disabled:opacity-50",
].join(" ");

export interface DeckFieldDefaults {
  title?: string;
  description?: string | null;
  cefrLevel?: string | null;
  category?: string | null;
}

export function DeckFields({
  issues,
  errorId,
  defaults = {},
}: {
  issues: DeckIssue[];
  errorId: string;
  defaults?: DeckFieldDefaults;
}) {
  const t = useTranslations("Library");
  const keys = issues.map(deckIssueKey);
  const titleInvalid = keys.some((key) => key.startsWith("title"));
  const descriptionInvalid = keys.some((key) => key.startsWith("description"));
  const levelInvalid = keys.includes("cefrLevel_invalid");
  const categoryInvalid = keys.includes("category_invalid");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="deck-title">{t("fields.titleLabel")}</Label>
        <Input
          id="deck-title"
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={defaults.title ?? ""}
          aria-invalid={titleInvalid || undefined}
          aria-describedby={titleInvalid ? errorId : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="deck-description">{t("fields.descriptionLabel")}</Label>
        <textarea
          id="deck-description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={defaults.description ?? ""}
          aria-invalid={descriptionInvalid || undefined}
          aria-describedby={descriptionInvalid ? errorId : undefined}
          className={`${CONTROL_CLASS} py-2`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="deck-cefrLevel">{t("fields.levelLabel")}</Label>
        <select
          id="deck-cefrLevel"
          name="cefrLevel"
          defaultValue={defaults.cefrLevel ?? ""}
          aria-invalid={levelInvalid || undefined}
          aria-describedby={levelInvalid ? errorId : undefined}
          className={CONTROL_CLASS}
        >
          <option value="">{t("fields.levelNone")}</option>
          {CEFR_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="deck-category">{t("fields.categoryLabel")}</Label>
        <select
          id="deck-category"
          name="category"
          defaultValue={defaults.category ?? ""}
          aria-invalid={categoryInvalid || undefined}
          aria-describedby={categoryInvalid ? errorId : undefined}
          className={CONTROL_CLASS}
        >
          <option value="">{t("fields.categoryNone")}</option>
          {DECK_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`categories.${category}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
