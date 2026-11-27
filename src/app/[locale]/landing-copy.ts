const copy = {
  es: {
    skip: "Saltar al contenido",
    method: "Cómo funciona",
    category: "Tarjetas de idiomas",
    heading: ["De entenderlo", "a decirlo."],
    description:
      "Convierte tu vocabulario, gramática y apuntes en tarjetas. Practica con ellas y Lexora organizará tus próximos repasos según lo que recuerdes.",
    demo: "Probar la demo",
    terms: "3 ejercicios · Sin registro",
    deck: "Mazo de la demo",
    destination: "Destino",
    origin: "Desde London Victoria",
    theme: "Inglés",
    continueDemo: "Practicar el viaje a Brighton",
    steps: [
      {
        title: "Crea tu mazo",
        body: "Agrupa tus palabras y expresiones por tema. Añade tus propias tarjetas o importa una lista desde un archivo.",
      },
      {
        title: "Recuerda la respuesta",
        body: "Traduce una palabra o completa una frase. Intenta responder antes de dar la vuelta a la tarjeta.",
      },
      {
        title: "Vuelve en el momento justo",
        body: "Indica cuánto te ha costado cada tarjeta. Lexora usa la repetición espaciada para programar el siguiente repaso.",
      },
    ],
  },
  en: {
    skip: "Skip to content",
    method: "How it works",
    category: "Language flashcards",
    heading: ["From knowing it", "to saying it."],
    description:
      "Turn your vocabulary, grammar and notes into flashcards. Practise with them and Lexora will plan your next reviews around what you remember.",
    demo: "Try the demo",
    terms: "3 exercises · No account needed",
    deck: "Demo deck",
    destination: "Destination",
    origin: "From London Victoria",
    theme: "English",
    continueDemo: "Practise the trip to Brighton",
    steps: [
      {
        title: "Build your deck",
        body: "Group words and expressions by topic. Add flashcards of your own or import a list from a file.",
      },
      {
        title: "Recall the answer",
        body: "Translate a word or complete a sentence. Try answering from memory before you turn the card over.",
      },
      {
        title: "Revisit it at the right time",
        body: "Rate how hard each card felt. Lexora uses spaced repetition to schedule your next review.",
      },
    ],
  },
} as const;

export function getLandingCopy(locale: string) {
  return locale === "es" ? copy.es : copy.en;
}
