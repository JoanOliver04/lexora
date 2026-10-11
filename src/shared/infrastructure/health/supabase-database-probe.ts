import type { DatabaseProbe } from "@/shared/application/health/check-health";

import { clientEnv } from "@/env/client";

/**
 * Database access probe through the Supabase Data API.
 *
 * An empty SELECT on the public language catalogue checks database access with
 * the publishable key, without downloading rows, creating a session or writing.
 * The hosted OpenAPI root rejects publishable keys and cannot serve this check.
 * A missing table or denied read remains unhealthy; it is not a successful probe.
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
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/languages?select=id&limit=0`,
          {
            headers: {
              apikey: clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
              Accept: "application/json",
            },
            signal: controller.signal,
            cache: "no-store",
          },
        );

        if (!response.ok) return false;

        const rows: unknown = await response.json();
        return Array.isArray(rows) && rows.length === 0;
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
