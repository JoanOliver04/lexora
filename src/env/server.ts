import "server-only";

import { z } from "zod";

import { formatEnvError, shouldSkipValidation } from "./shared";

/**
 * Variables de entorno del servidor.
 *
 * `import "server-only"` es la parte importante de este archivo: si alguien
 * importa este módulo desde un Client Component, **el build falla**. No es una
 * convención de nombres ni una advertencia en un comentario; es un error de
 * compilación.
 *
 * Sin esa línea, un `import { serverEnv } from "@/env/server"` en un componente
 * de cliente publicaría estos valores en el bundle que descarga el navegador. No
 * daría ningún error: funcionaría, y el secreto quedaría expuesto.
 *
 * Aquí nunca va una variable con prefijo `NEXT_PUBLIC_`. Esas van en
 * `./client.ts` y son públicas por definición.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

type ServerEnv = z.infer<typeof serverSchema>;

function loadServerEnv(): ServerEnv {
  if (shouldSkipValidation) {
    return serverSchema.parse({ NODE_ENV: process.env["NODE_ENV"] ?? "development" });
  }

  const parsed = serverSchema.safeParse({
    NODE_ENV: process.env["NODE_ENV"],
  });

  if (!parsed.success) {
    // Se lanza al cargar el módulo, no en la primera petición que use la
    // variable: es preferible que la aplicación no arranque a que arranque mal y
    // falle media hora después con un `undefined` a mitad de una consulta.
    throw new Error(formatEnvError(parsed.error, "servidor"));
  }

  return parsed.data;
}

export const serverEnv: ServerEnv = loadServerEnv();
