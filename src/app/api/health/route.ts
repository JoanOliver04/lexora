import { NextResponse } from "next/server";

import { getHealthReport } from "@/composition/health";

/**
 * Comprobación de salud pública.
 *
 * Sirve para que un supervisor externo, o el propio despliegue, sepa si la
 * aplicación está viva y si alcanza sus dependencias.
 *
 * **Qué NO devuelve, y por qué.** Este punto es público y sin autenticación,
 * así que no expone versiones, cadenas de conexión, nombres de servicio ni
 * mensajes de error. Un health check hablador es una herramienta de
 * reconocimiento gratuita para quien busca por dónde entrar: la diferencia entre
 * «algo va mal» y «PostgreSQL 15.3 en tal host rechazó la contraseña» es la
 * diferencia entre un aviso y un mapa.
 *
 * Devuelve 200 cuando todo responde y **503** cuando una dependencia falla, no
 * 200 con un campo que diga que va mal: los supervisores miran el código de
 * estado, y un 200 significa «todo bien» para cualquiera que no lea el cuerpo.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getHealthReport();

  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: {
      // Una respuesta cacheada convierte el health check en un adorno: seguiría
      // diciendo «ok» un cuarto de hora después de que todo se cayera.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
