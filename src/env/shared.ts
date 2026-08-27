import { z } from "zod";

/**
 * Utilidades compartidas por los esquemas de servidor y de cliente.
 *
 * No importa `server-only` ni `client-only`: lo cargan ambos lados.
 */

/**
 * Escotilla para saltarse la validación.
 *
 * Existe por un caso real: construir la aplicación en un contenedor o en un paso
 * de CI que solo compila y no ejecuta nada, donde las variables de producción no
 * están —ni deben estar— disponibles.
 *
 * Nunca debe activarse en un entorno que vaya a servir tráfico. Si se activa,
 * cada variable queda con su valor por defecto o vacía, y el fallo aparecerá más
 * tarde y peor.
 */
export const shouldSkipValidation = process.env["SKIP_ENV_VALIDATION"] === "true";

/**
 * Convierte un error de Zod en un mensaje que dice qué falta y qué se esperaba.
 *
 * El error crudo de Zod es correcto pero ilegible a las siete de la mañana. Esto
 * lo deja en una lista de variables con su problema.
 */
export function formatEnvError(error: z.ZodError, scope: "servidor" | "cliente"): string {
  const issues = error.issues
    .map((issue) => {
      const name = issue.path.join(".") || "(raíz)";
      return `  · ${name}: ${issue.message}`;
    })
    .join("\n");

  return [
    "",
    `✖ Variables de entorno de ${scope} inválidas o ausentes:`,
    "",
    issues,
    "",
    "Revisa tu archivo .env contra .env.example.",
    "",
  ].join("\n");
}
