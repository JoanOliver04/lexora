"use client";

import { useTranslations } from "next-intl";

import type { PracticeItem } from "@/modules/library/domain/practice-item";
import { practiceItemContentFrom } from "@/modules/library/application/practice-item-content";
import {
  PracticeItemAnswer,
  PracticeItemPrompt,
} from "@/modules/library/presentation/practice-item-content";

/**
 * Previsualización de un ítem de práctica (LEX-3.11): cómo se vería al
 * estudiar, sin planificador ni valoración —eso es FASE 5/6—, solo lectura
 * sobre el `PracticeItem` ya guardado.
 *
 * `<details>`/`<summary>` nativo para «ver respuesta»: coherente con el resto
 * de la biblioteca (sin JavaScript de cliente para alternar visibilidad).
 *
 * **Sin convención de hueco literal en `promptText`.** LEX-3.7 no fijó ninguna
 * (`config.answers` guarda las soluciones en orden, pero el enunciado de un
 * `cloze` es texto libre —la persona ya escribe el hueco como quiera, p. ej.
 * «I ___ to work»—). Inventar aquí un marcador y sustituirlo sería una
 * decisión de producto no pedida por esta tarea: el enunciado se muestra tal
 * cual se guardó, y las soluciones del hueco se listan aparte, con su
 * etiqueta, para el modo `cloze`.
 */
export function PracticeItemPreview({ item }: { item: PracticeItem }) {
  const t = useTranslations("Concepts");
  const tCard = useTranslations("PracticeCard");
  const content = practiceItemContentFrom(item);
  if (!content) return <p role="status">{tCard("unavailable")}</p>;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-(--radius-control) border border-(--color-border) p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{t("items.preview.heading")}</h2>
        <span className="text-xs text-(--color-ink-subtle)">{t(`items.modes.${item.mode}`)}</span>
      </div>

      <PracticeItemPrompt content={content} hintLabel={t("items.preview.hintLabel")} />

      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm underline underline-offset-4">
          {t("items.preview.reveal")}
        </summary>
        <div className="mt-2">
          <PracticeItemAnswer
            content={content}
            clozeAnswersLabel={t("items.preview.clozeAnswersLabel")}
          />
        </div>
      </details>
    </section>
  );
}
