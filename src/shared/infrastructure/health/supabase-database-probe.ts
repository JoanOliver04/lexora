import type { DatabaseProbe } from "@/shared/application/health/check-health";

import { clientEnv } from "@/env/client";

/**
 * Sonda real contra la API de Supabase.
 *
 * Pide la raíz de PostgREST, que responde sin necesidad de que exista ninguna
 * tabla. Comprueba lo que un health check debe comprobar —que el servicio está
 * levantado y es alcanzable desde este proceso— y nada más: no consulta datos,
 * no crea sesión y no toca el esquema.
 *
 * Tiene un tiempo límite propio. Sin él, una base de datos que acepta la
 * conexión pero no responde dejaría la petición colgada hasta que la agotara el
 * servidor, y un health check que tarda treinta segundos en decir que algo va
 * mal no sirve para lo que existe.
 */
export function createSupabaseDatabaseProbe(timeoutMs = 3000): DatabaseProbe {
  return {
    async isReachable() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
          headers: { apikey: clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
          signal: controller.signal,
          cache: "no-store",
        });

        return response.ok;
      } catch {
        // Cualquier fallo —red, tiempo agotado, DNS— significa lo mismo para
        // quien pregunta: no es alcanzable. El detalle se queda aquí a
        // propósito: ver §"qué no devuelve" en la ruta.
        return false;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
