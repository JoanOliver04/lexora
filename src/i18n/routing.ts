import { defineRouting } from "next-intl/routing";

/**
 * Enrutado por idioma **de interfaz**.
 *
 * Aquí solo se declara en qué idioma se le habla al usuario. Lexora maneja
 * cuatro conceptos de idioma distintos, y confundirlos es la vía rápida a un
 * modelo que no admite un segundo par de idiomas sin rehacer el núcleo:
 *
 * | Concepto              | Qué es                                  | Dónde vive        |
 * | --------------------- | --------------------------------------- | ----------------- |
 * | Idioma de interfaz    | En qué idioma está la aplicación        | **Aquí**          |
 * | Idioma de apoyo       | El idioma que el usuario ya domina      | Perfil y curso    |
 * | Idioma objetivo       | El idioma que se estudia                | Curso             |
 * | Variante del contenido| La variante regional del material       | Curso             |
 *
 * Que la interfaz esté en inglés no significa que el usuario estudie inglés, ni
 * que su idioma de apoyo deje de ser el español. Ver `docs/GLOSSARY.md`.
 */
export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
});

/** Idiomas de interfaz disponibles. No confundir con el idioma estudiado. */
export type UiLocale = (typeof routing.locales)[number];
