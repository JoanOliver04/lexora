/**
 * Comprobación de salud.
 *
 * Vive en la capa de aplicación y depende de un **puerto**, no de un cliente
 * concreto. Así puede probarse sin red y sin base de datos: basta con pasarle
 * una sonda que devuelva lo que haga falta.
 */

export type HealthStatus = "ok" | "degraded";

export interface HealthReport {
  status: HealthStatus;
  /** La aplicación responde. Si esto se lee, es que sí. */
  app: boolean;
  /** La base de datos es alcanzable. */
  database: boolean;
}

/** Puerto: alguien sabe decir si la base de datos responde. */
export interface DatabaseProbe {
  isReachable(): Promise<boolean>;
}

export async function checkHealth(probe: DatabaseProbe): Promise<HealthReport> {
  const database = await probe.isReachable();

  return {
    // `degraded` y no `error`: la aplicación está sirviendo esta respuesta, así
    // que decir que está caída sería falso. Lo que falla es una dependencia.
    status: database ? "ok" : "degraded",
    app: true,
    database,
  };
}
