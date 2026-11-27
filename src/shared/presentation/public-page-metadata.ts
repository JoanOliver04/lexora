import type { Metadata } from "next";
import { clientEnv } from "@/env/client";

const descriptions = {
  es: {
    home: {
      title: "Lexora · Practica inglés con tus propios mazos",
      description:
        "Convierte tus apuntes en sesiones de inglés y vuelve a cada tarjeta cuando toque. Prueba el viaje a Brighton sin registrarte.",
    },
    demo: {
      title: "Un viaje a Brighton · Demo interactiva de Lexora",
      description:
        "Pide un billete, completa una frase y escucha tu andén. Prueba tres actividades de inglés y descubre cuándo repasarías tu tarjeta. Sin registro.",
    },
    image:
      "Lexora. ¿De qué andén sale tu tren? Demo de inglés sin registro, con una estación británica al atardecer.",
  },
  en: {
    home: {
      title: "Lexora · Practise English with your own decks",
      description:
        "Turn your notes into English practice and revisit each card when it is due. Try the trip to Brighton without signing up.",
    },
    demo: {
      title: "A trip to Brighton · Interactive Lexora demo",
      description:
        "Ask for a ticket, complete a sentence and listen for your platform. Try three English activities and discover when your card is due again. No account needed.",
    },
    image:
      "Lexora. Which platform is your train on? An English demo with no sign-up, set in a British railway station at sunset.",
  },
} as const;

export function publicPageMetadata(locale: string, page: "home" | "demo"): Metadata {
  const language = locale === "en" ? "en" : "es";
  const copy = descriptions[language][page];
  const base = new URL(clientEnv.NEXT_PUBLIC_SITE_URL);
  const path = page === "demo" ? "/demo" : "";
  const pageUrl = (languageCode: string) => new URL(`/${languageCode}${path}`, base);
  const image = {
    url: new URL(`/demo-media/brighton-${language}.jpg`, base),
    width: 1200,
    height: 630,
    alt: descriptions[language].image,
  };

  return {
    ...copy,
    alternates: {
      canonical: pageUrl(language),
      languages: { es: pageUrl("es"), en: pageUrl("en") },
    },
    openGraph: {
      ...copy,
      type: "website",
      siteName: "Lexora",
      locale: language === "es" ? "es_ES" : "en_GB",
      url: pageUrl(language),
      images: [image],
    },
    twitter: { ...copy, card: "summary_large_image", images: [image] },
  };
}
