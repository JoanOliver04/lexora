"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError, Input, Label } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { PendingButton } from "../../(auth)/_components/pending-button";
import { attachTagAction, type TagFormState } from "./actions";
import { tagIssueKey } from "./message-key";

const ERROR_ID = "add-tag-error";

/**
 * Añade una etiqueta a un concepto por nombre. Formulario propio con su propio
 * `useActionState`: es una unión de error distinta (`TagIssue`) a la del
 * formulario del concepto (`ConceptIssue`) y no comparten región `role="alert"`.
 */
export function AddTagForm({ locale, conceptId }: { locale: string; conceptId: string }) {
  const t = useTranslations("Concepts");
  const [state, action] = useActionState<TagFormState, FormData>(attachTagAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const issues = state.issues ?? [];

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conceptId" value={conceptId} />

      {issues.length > 0 || state.error ? (
        <FormError id={ERROR_ID}>
          {state.error ? <p>{t("tags.genericError")}</p> : null}
          {issues.map((issue) => (
            <p key={issue}>{t(`tags.errors.${tagIssueKey(issue)}`)}</p>
          ))}
        </FormError>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tag-name">{t("tags.addLabel")}</Label>
          <Input
            id="tag-name"
            name="name"
            type="text"
            required
            maxLength={200}
            placeholder={t("tags.addPlaceholder")}
            aria-invalid={issues.length > 0 || undefined}
            aria-describedby={issues.length > 0 ? ERROR_ID : undefined}
            className="max-w-64"
          />
        </div>
        <PendingButton idle={t("tags.addButton")} pending={t("tags.adding")} />
      </div>
    </form>
  );
}
