"use client";

import { useTranslations } from "next-intl";

import { Input, Label } from "@/shared/presentation/components";
import type { ConceptIssue } from "@/modules/library/domain/concept";
import { CEFR_LEVELS, CONCEPT_KINDS } from "@/modules/library/domain/taxonomy";

import { conceptIssueKey } from "./message-key";

/**
 * Campos de un concepto, compartidos entre el alta y la edición. Mismo patrón
 * que `decks/deck-fields.tsx`, con una diferencia real: aquí **`kind` y
 * `summary` son obligatorios** (`validateConceptDraft` los rechaza en blanco),
 * a diferencia de la categoría y la descripción de un mazo. El `<select>` de
 * tipo no tiene opción vacía: siempre hay un valor por defecto
 * (`CONCEPT_KINDS[0]`, «Vocabulario»).
 *
 * `sourceReference` se valida también en el dominio: el maxLength del cliente
 * es una ayuda, nunca una garantía para una petición manipulada.
 */

const CONTROL_CLASS = [
  "w-full rounded-(--radius-control) px-3 min-h-11",
  "border border-(--color-border-strong)",
  "bg-(--color-surface) text-(--color-ink)",
  "placeholder:text-(--color-ink-subtle)",
  "aria-invalid:border-(--color-danger)",
  "disabled:opacity-50",
].join(" ");

export interface ConceptFieldDefaults {
  kind?: string;
  title?: string;
  summary?: string;
  explanation?: string | null;
  example?: string | null;
  cefrLevel?: string | null;
  sourceReference?: string | null;
}

export function ConceptFields({
  issues,
  errorId,
  defaults = {},
}: {
  issues: ConceptIssue[];
  errorId: string;
  defaults?: ConceptFieldDefaults;
}) {
  const t = useTranslations("Concepts");
  const keys = issues.map(conceptIssueKey);
  const kindInvalid = keys.includes("kind_invalid");
  const titleInvalid = keys.some((key) => key.startsWith("title"));
  const summaryInvalid = keys.some((key) => key.startsWith("summary"));
  const explanationInvalid = keys.some((key) => key.startsWith("explanation"));
  const exampleInvalid = keys.some((key) => key.startsWith("example"));
  const levelInvalid = keys.includes("cefrLevel_invalid");
  const sourceInvalid = keys.includes("sourceReference_tooLong");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="concept-kind">{t("fields.kindLabel")}</Label>
        <select
          key={defaults.kind ?? CONCEPT_KINDS[0]}
          id="concept-kind"
          name="kind"
          required
          defaultValue={defaults.kind ?? CONCEPT_KINDS[0]}
          aria-invalid={kindInvalid || undefined}
          aria-describedby={kindInvalid ? errorId : undefined}
          className={CONTROL_CLASS}
        >
          {CONCEPT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="concept-title">{t("fields.titleLabel")}</Label>
        <Input
          id="concept-title"
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
        <Label htmlFor="concept-summary">{t("fields.summaryLabel")}</Label>
        <textarea
          id="concept-summary"
          name="summary"
          rows={2}
          required
          maxLength={500}
          defaultValue={defaults.summary ?? ""}
          aria-invalid={summaryInvalid || undefined}
          aria-describedby={summaryInvalid ? errorId : undefined}
          className={`${CONTROL_CLASS} py-2`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="concept-explanation">{t("fields.explanationLabel")}</Label>
        <textarea
          id="concept-explanation"
          name="explanation"
          rows={4}
          maxLength={4000}
          defaultValue={defaults.explanation ?? ""}
          aria-invalid={explanationInvalid || undefined}
          aria-describedby={explanationInvalid ? errorId : undefined}
          className={`${CONTROL_CLASS} py-2`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="concept-example">{t("fields.exampleLabel")}</Label>
        <textarea
          id="concept-example"
          name="example"
          rows={2}
          maxLength={500}
          defaultValue={defaults.example ?? ""}
          aria-invalid={exampleInvalid || undefined}
          aria-describedby={exampleInvalid ? errorId : undefined}
          className={`${CONTROL_CLASS} py-2`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="concept-cefrLevel">{t("fields.levelLabel")}</Label>
        <select
          key={defaults.cefrLevel ?? ""}
          id="concept-cefrLevel"
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
        <Label htmlFor="concept-sourceReference">{t("fields.sourceReferenceLabel")}</Label>
        <Input
          id="concept-sourceReference"
          name="sourceReference"
          type="text"
          maxLength={500}
          defaultValue={defaults.sourceReference ?? ""}
          aria-invalid={sourceInvalid || undefined}
          aria-describedby={sourceInvalid ? errorId : undefined}
        />
      </div>
    </div>
  );
}
