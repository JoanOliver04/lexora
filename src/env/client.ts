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

  // Supabase. La clave *publishable* esta pensada para vivir en el navegador:
  // no concede permisos por si misma, porque quien decide que puede leer o
  // escribir cada usuario es Row Level Security dentro de PostgreSQL. La clave
  // secreta NO esta aqui ni puede estarlo: ver `./server.ts`.
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

type ClientEnv = z.infer<typeof clientSchema>;

function loadClientEnv(): ClientEnv {
  const raw = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };

  if (shouldSkipValidation) {
    // Con la validacion saltada no hay valores por defecto razonables para la
    // conexion: se devuelven marcadores evidentes. Si alguno acaba en una
    // peticion real, el fallo sera ruidoso, que es lo que se quiere.
    return {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://skipped.invalid",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "skipped",
    };
  }

  const parsed = clientSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error, "cliente"));
  }

  return parsed.data;
}

export const clientEnv: ClientEnv = loadClientEnv();
