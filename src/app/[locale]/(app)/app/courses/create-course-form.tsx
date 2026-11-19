"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormError, Input, Label } from "@/shared/presentation/components";
import { createLanguageCourseAction } from "./actions";

export function CreateCourseForm({
  locale,
  profileVersion,
  languages,
}: {
  locale: string;
  profileVersion: string;
  languages: { locale: string; label: string }[];
}) {
  const t = useTranslations("Courses");
  const router = useRouter();
  const [state, action, pending] = useActionState(createLanguageCourseAction, {});
  const [title, setTitle] = useState("");
  const [targetLocale, setTargetLocale] = useState("");
  return (
    <form action={action} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="profileVersion" value={profileVersion} />
      {state.error && (
        <FormError id="create-course-error">
          <p>{t(`errors.${state.error}`)}</p>
          {state.error === "conflict" && (
            <Button type="button" variant="secondary" onClick={() => router.refresh()}>
              {t("reload")}
            </Button>
          )}
        </FormError>
      )}
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4 border-0 p-0">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="new-course-title">{t("name")}</Label>
          <Input
            id="new-course-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="new-course-language">{t("language")}</Label>
          <select
            className="min-h-11 w-full min-w-0 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3"
            id="new-course-language"
            name="targetLocale"
            value={targetLocale}
            onChange={(event) => setTargetLocale(event.target.value)}
            required
          >
            <option value="" disabled>
              {t("chooseLanguage")}
            </option>
            {languages.map((language) => (
              <option key={language.locale} value={language.locale}>
                {language.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="self-start">
          {t(pending ? "creating" : "create")}
        </Button>
      </fieldset>
    </form>
  );
}
