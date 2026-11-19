export function courseLanguageNames(locale: string) {
  const formatter = new Intl.DisplayNames(locale, {
    type: "language",
    languageDisplay: "standard",
  });
  return (tag: string) => {
    try {
      const name = formatter.of(tag) ?? tag;
      return locale === "es" ? name.toLocaleLowerCase(locale) : name;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return tag;
    }
  };
}

function comparableName(name: string) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ");
}

export function resolveCourseLanguage(name: string, catalogue: readonly string[]) {
  const query = comparableName(name);
  const spanish = courseLanguageNames("es");
  const english = courseLanguageNames("en");
  const direct = catalogue.find((tag) =>
    [tag, spanish(tag), english(tag)].some((alias) => comparableName(alias) === query),
  );
  if (direct) return { targetLocale: direct, targetLanguageName: null };

  const matches = catalogue.filter((tag) => {
    const base = tag.split("-")[0]!;
    return [base, spanish(base), english(base), courseLanguageNames(base)(base)].some(
      (alias) => comparableName(alias) === query,
    );
  });
  return matches.length === 1
    ? { targetLocale: matches[0]!, targetLanguageName: null }
    : { targetLocale: "und", targetLanguageName: name };
}
