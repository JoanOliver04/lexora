export function courseLanguageNames(locale: string) {
  const formatter = new Intl.DisplayNames(locale, {
    type: "language",
    languageDisplay: "standard",
  });
  return (tag: string) => {
    let name: string;
    try {
      name = formatter.of(tag) ?? tag;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return tag;
    }
    return locale === "es" ? name.toLocaleLowerCase(locale) : name;
  };
}

export function courseChoiceLabels(
  locale: string,
  courses: readonly { id: string; title: string; targetLocale: string }[],
) {
  const display = courseLanguageNames(locale);
  return courses.map(({ id, title, targetLocale }) => ({
    id,
    label: `${title} · ${display(targetLocale)}`,
  }));
}
