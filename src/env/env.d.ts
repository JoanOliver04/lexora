/**
 * Declaración de las variables públicas.
 *
 * Existe por un choque real entre dos cosas que queremos las dos:
 *
 * 1. `noPropertyAccessFromIndexSignature`, activado en `tsconfig.json`, obliga a
 *    escribir `process.env["FOO"]` para cualquier clave que el tipo no declare.
 * 2. Next.js sustituye `process.env.NEXT_PUBLIC_FOO` por su valor **de forma
 *    textual** al construir. La forma documentada es el acceso por punto.
 *
 * Declarar aquí las variables públicas las convierte en propiedades reales, así
 * que el acceso por punto deja de venir de una firma de índice y las dos
 * condiciones se cumplen a la vez.
 *
 * Solo van aquí variables `NEXT_PUBLIC_*`. Las de servidor no se declaran a
 * propósito: obligar a `process.env["LO_QUE_SEA"]` para ellas es un recordatorio
 * de que no son intercambiables.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_SITE_URL?: string;
  }
}
