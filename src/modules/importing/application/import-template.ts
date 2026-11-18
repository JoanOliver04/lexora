export const IMPORT_LESSON_TYPES = ["vocabulary", "grammar", "phrases"] as const;
export type ImportLessonType = (typeof IMPORT_LESSON_TYPES)[number];
export type ImportAnswerLanguage = "es" | "en";

const EXAMPLES = {
  vocabulary: [
    {
      front: "referee",
      es: "Árbitro o árbitra. The referee blew the whistle.",
      en: "The official who enforces the rules. The referee blew the whistle.",
      tags: "sports::roles",
    },
    {
      front: "warm up",
      es: "Calentar antes de hacer ejercicio. We warm up before every match.",
      en: "To prepare your body for exercise. We warm up before every match.",
      tags: "sports::training",
    },
  ],
  grammar: [
    {
      front: "Complete with the present perfect: I ___ (finish) my homework.",
      es: "I have finished my homework. Usa have + participio.",
      en: "I have finished my homework. Use have + past participle.",
      tags: "grammar::present-perfect::form",
    },
    {
      front: "Choose for or since: She has lived here ___ 2020.",
      es: "Since. Indica el punto de inicio, 2020.",
      en: "Since. It marks the starting point, 2020.",
      tags: "grammar::present-perfect::time",
    },
  ],
  phrases: [
    {
      front: "Can I try this on?",
      es: "¿Puedo probármelo? Úsalo al comprar ropa.",
      en: "Ask to try on a piece of clothing before buying it.",
      tags: "shopping::clothes",
    },
    {
      front: "Do you have this in a larger size?",
      es: "¿Lo tienen en una talla más grande?",
      en: "Ask whether the shop has the same item in a bigger size.",
      tags: "shopping::sizes",
    },
  ],
} satisfies Record<
  ImportLessonType,
  readonly { front: string; es: string; en: string; tags: string }[]
>;

export const IMPORT_TEMPLATE_DIRECTIVE = "#separator:comma";

export function importTemplateRows(type: ImportLessonType, language: ImportAnswerLanguage) {
  return EXAMPLES[type].map(({ front, tags, ...answers }) => ({
    front,
    back: answers[language],
    tags,
  }));
}

export function serializeImportTemplate(rows: ReturnType<typeof importTemplateRows>): string {
  const quote = (field: string) => `"${field.replaceAll('"', '""')}"`;
  const data = rows.map(({ front, back, tags }) => [front, back, tags].map(quote).join(","));
  return [IMPORT_TEMPLATE_DIRECTIVE, ...data, ""].join("\n");
}

/** Unwrap one complete plain-text code block from a chat response. */
export function unwrapPastedImport(text: string): string {
  const opening = /^\s*```(?:csv|tsv|txt|text)?[ \t]*\r?\n/i.exec(text);
  if (!opening) return text;
  const body = text.slice(opening[0].length);
  const closing = /(?:^|\r?\n)```[ \t]*(?:\r?\n[ \t]*)*$/.exec(body);
  return closing ? body.slice(0, closing.index) : text;
}
