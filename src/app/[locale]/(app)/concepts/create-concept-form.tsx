"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { Link } from "@/i18n/navigation";
import { FormError } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { createConceptAction, type ConceptFormState } from "./actions";
import { ConceptFields } from "./concept-fields";
import { conceptIssueKey } from "./message-key";

const ERROR_ID = "create-concept-error";

/**
 * Alta de un concepto. Mismo patrón que `CreateDeckForm` (LEX-3.5).
 *
 * Sugerencia de duplicados (LEX-3.10): si `createConceptAction` encuentra un
 * concepto vivo con la misma `canonicalKey`, no crea nada y devuelve
 * `duplicates` — se muestra la coincidencia con un enlace a su detalle, y el
 * mismo botón de envío cambia de «Crear concepto» a «Crear de todos modos».
 * **No** es un segundo botón con su propio `name`/`value`: un campo oculto
 * `confirmDuplicate` refleja si la pantalla ya está mostrando el aviso
 * (`duplicates.length > 0`), así que reenviar el mismo formulario una vez
 * visto el aviso confirma la creación — sin depender de qué botón concreto
 * disparó el envío, que un `<form action={...}>` de Next.js no garantiza
 * conservar como parte de `FormData`.
 */
export function CreateConceptForm({ locale }: { locale: string }) {
  const t = useTranslations("Concepts");
  const [state, action] = useActionState<ConceptFormState, FormData>(createConceptAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const issues = state.issues ?? [];
  const duplicates = state.duplicates ?? [];

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="confirmDuplicate" value={duplicates.length > 0 ? "1" : "0"} />

      {issues.length > 0 || state.error ? (
        <FormError id={ERROR_ID}>
          {state.error ? <p>{t("genericError")}</p> : null}
          {issues.map((issue) => (
            <p key={issue}>{t(`errors.${conceptIssueKey(issue)}`)}</p>
          ))}
        </FormError>
      ) : null}

      {duplicates.length > 0 ? (
        <div
          aria-live="polite"
          className="flex flex-col gap-2 rounded-(--radius-control) border border-(--color-border-strong) p-3 text-sm"
        >
          <p>{t("duplicates.heading")}</p>
          <ul className="flex flex-col gap-1">
            {duplicates.map((duplicate) => (
              <li key={duplicate.id}>
                <Link href={`/concepts/${duplicate.id}`} className="underline underline-offset-4">
                  {duplicate.title}
                </Link>{" "}
                <span className="text-(--color-ink-subtle)">({t(`kinds.${duplicate.kind}`)})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConceptFields
        issues={issues}
        errorId={ERROR_ID}
        {...(state.values ? { defaults: state.values } : {})}
      />

      <PendingButton
        idle={duplicates.length > 0 ? t("duplicates.createAnyway") : t("actions.create")}
        pending={t("actions.creating")}
      />
    </form>
  );
}
