import { z } from "zod";

import { formatEnvError, shouldSkipValidation } from "./shared";

/**
 * Variables de entorno del cliente.
 *
 * Todo lo que hay aquí **es público**. Next.js sustituye `process.env.NEXT_PUBLIC_*`
 * por su valor literal en tiempo de build, así que acaba dentro del JavaScript que
 * descarga cualquier visitante. Ponerle prefijo `NEXT_PUBLIC_` a un secreto no lo
 * protege: lo publica.
 *
 * Las variables se leen por su nombre completo y literal, sin construir la clave.
 * Es obligatorio: la sustitución de Next.js es textual, y `process.env[nombre]`
 * con una variable no se sustituye por nada.
 *
 * El acceso por punto requiere que la variable esté declarada en `./env.d.ts`;
 * ahí está explicado el motivo.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

type ClientEnv = z.infer<typeof clientSchema>;

function loadClientEnv(): ClientEnv {
  const raw = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  };

  if (shouldSkipValidation) {
    return clientSchema.parse({});
  }

  const parsed = clientSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error, "cliente"));
  }

  return parsed.data;
}

export const clientEnv: ClientEnv = loadClientEnv();
