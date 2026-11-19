import { courseLanguageNames } from "../domain/course-language";

export function courseChoiceLabels(
  locale: string,
  courses: readonly {
    id: string;
    title: string;
    targetLocale: string;
    targetLanguageName: string | null;
  }[],
) {
  const display = courseLanguageNames(locale);
  return courses.map(({ id, title, targetLocale, targetLanguageName }) => ({
    id,
    label: `${title} · ${targetLanguageName ?? display(targetLocale)}`,
  }));
}
