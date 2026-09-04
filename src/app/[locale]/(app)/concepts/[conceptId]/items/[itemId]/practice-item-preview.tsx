"use client";

import { useTranslations } from "next-intl";

import type { PracticeItem } from "@/modules/library/domain/practice-item";

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

  return (
    <section className="flex flex-col gap-3 rounded-(--radius-control) border border-(--color-border) p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{t("items.preview.heading")}</h2>
        <span className="text-xs text-(--color-ink-subtle)">{t(`items.modes.${item.mode}`)}</span>
      </div>

      <p className="whitespace-pre-wrap text-sm">{item.promptText}</p>

      {item.hintText ? (
        <p className="text-sm text-(--color-ink-muted)">
          {t("items.preview.hintLabel")}: {item.hintText}
        </p>
      ) : null}

      <details>
        <summary className="cursor-pointer text-sm underline underline-offset-4">
          {t("items.preview.reveal")}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <p className="whitespace-pre-wrap text-sm">{item.answerText}</p>
          {item.config.mode === "cloze" ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-(--color-ink-subtle)">
                {t("items.preview.clozeAnswersLabel")}
              </p>
              {/* El orden es el dato: `config.answers` no tiene un
                  identificador propio por hueco, solo su posición — el
                  índice es una clave estable aquí. */}
              <ol className="list-inside list-decimal text-sm">
                {item.config.answers.map((answer, index) => (
                  <li key={index}>{answer}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
