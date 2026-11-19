export const IMPORT_LESSON_TYPES = ["vocabulary", "grammar", "phrases"] as const;
export type ImportLessonType = (typeof IMPORT_LESSON_TYPES)[number];
export type ImportAnswerLanguage = "es" | "en" | "target";

type Examples = Record<
  ImportLessonType,
  readonly { front: string; es: string; en: string; target?: string; tags: string }[]
>;

const ENGLISH: Examples = {
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
};

const EXAMPLES: Record<string, Examples> = {
  en: ENGLISH,
  fr: {
    vocabulary: [
      {
        front: "le sifflet",
        es: "El silbato. L’arbitre souffle dans son sifflet.",
        en: "The whistle. L’arbitre souffle dans son sifflet.",
        target: "Petit instrument qui produit un son aigu. L’arbitre souffle dans son sifflet.",
        tags: "sports::materiel",
      },
    ],
    grammar: [
      {
        front: "Complétez au passé composé : J’___ (finir) mes devoirs.",
        es: "J’ai fini mes devoirs. Usa avoir y el participio fini.",
        en: "J’ai fini mes devoirs. Use avoir and the participle fini.",
        target: "J’ai fini mes devoirs. On emploie avoir et le participe passé fini.",
        tags: "grammaire::passe-compose",
      },
    ],
    phrases: [
      {
        front: "Est-ce que je peux l’essayer ?",
        es: "¿Puedo probármelo? Se usa al comprar ropa.",
        en: "Can I try it on? Use this when shopping for clothes.",
        target: "Pour demander à enfiler un vêtement avant de l’acheter.",
        tags: "achats::vetements",
      },
    ],
  },
  de: {
    vocabulary: [
      {
        front: "die Pfeife",
        es: "El silbato. Die Schiedsrichterin bläst in die Pfeife.",
        en: "The whistle. Die Schiedsrichterin bläst in die Pfeife.",
        target:
          "Kleines Instrument für ein akustisches Signal. Die Schiedsrichterin bläst in die Pfeife.",
        tags: "sport::ausruestung",
      },
    ],
    grammar: [
      {
        front: "Ergänze das Perfekt: Ich ___ meine Hausaufgaben ___ (machen).",
        es: "Ich habe meine Hausaufgaben gemacht. Usa haben con el participio gemacht.",
        en: "Ich habe meine Hausaufgaben gemacht. Use haben with the participle gemacht.",
        target: "Ich habe meine Hausaufgaben gemacht. Das Perfekt von machen bildet man mit haben.",
        tags: "grammatik::perfekt",
      },
    ],
    phrases: [
      {
        front: "Kann ich das anprobieren?",
        es: "¿Puedo probármelo? Se usa al comprar ropa.",
        en: "Can I try it on? Use this when shopping for clothes.",
        target: "So fragst du, ob du ein Kleidungsstück vor dem Kauf anziehen darfst.",
        tags: "einkaufen::kleidung",
      },
    ],
  },
  it: {
    vocabulary: [
      {
        front: "il fischietto",
        es: "El silbato. L’arbitra usa il fischietto.",
        en: "The whistle. L’arbitra usa il fischietto.",
        target: "Uno strumento per dare un segnale sonoro. L’arbitra usa il fischietto.",
        tags: "sport::attrezzatura",
      },
    ],
    grammar: [
      {
        front: "Completa al passato prossimo: ___ (finire) i compiti.",
        es: "Ho finito i compiti. Usa avere con el participio finito.",
        en: "Ho finito i compiti. Use avere with the participle finito.",
        target: "Ho finito i compiti. Con questo uso di finire si impiega l’ausiliare avere.",
        tags: "grammatica::passato-prossimo",
      },
    ],
    phrases: [
      {
        front: "Posso provarlo?",
        es: "¿Puedo probármelo? Se usa al comprar ropa.",
        en: "Can I try it on? Use this when shopping for clothes.",
        target: "Per chiedere di indossare un vestito prima di comprarlo.",
        tags: "acquisti::abbigliamento",
      },
    ],
  },
};

export const IMPORT_TEMPLATE_DIRECTIVE = "#separator:comma";

export function importTemplateRows(
  type: ImportLessonType,
  language: ImportAnswerLanguage,
  targetLocale = "en",
) {
  const target = targetLocale.split("-")[0] ?? "";
  const examples = Object.hasOwn(EXAMPLES, target) ? EXAMPLES[target] : undefined;
  return (examples?.[type] ?? []).map(({ front, tags, ...answers }) => ({
    front,
    back: language === "target" ? (answers.target ?? answers.en) : answers[language],
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
