import { useTranslations } from "next-intl";

/** Mounted per card and outside the review form. Writing stays in the browser. */
export function AnswerDraft() {
  const t = useTranslations("PracticeCard");
  return (
    <details className="min-w-0 text-sm">
      <summary className="min-h-11 w-fit cursor-pointer content-center text-(--color-accent) underline">
        {t("writeAnswer")}
      </summary>
      <label className="flex flex-col gap-1">
        {t("yourDraft")}
        <textarea
          rows={2}
          autoComplete="off"
          className="min-w-0 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) p-3 text-base text-(--color-ink)"
        />
      </label>
    </details>
  );
}
