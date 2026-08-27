import { describe, expect, it } from "vitest";

import { checkHealth, type DatabaseProbe } from "./check-health";

/**
 * Estos tests no tocan la red ni la base de datos, y esa es la razón de que el
 * caso de uso dependa de un puerto en lugar de un cliente concreto: comprobar
 * qué pasa cuando la base de datos no responde es trivial si puedes pasar una
 * sonda que diga que no responde, y muy incómodo si tienes que apagarla.
 */

const probeThatAnswers = (reachable: boolean): DatabaseProbe => ({
  isReachable: () => Promise.resolve(reachable),
});

describe("checkHealth", () => {
  it("informa de ok cuando la base de datos responde", async () => {
    const report = await checkHealth(probeThatAnswers(true));

    expect(report).toEqual({ status: "ok", app: true, database: true });
  });

  it("informa de degraded, no de error, cuando la base de datos no responde", async () => {
    // La aplicación está sirviendo la respuesta, así que decir que está caída
    // sería falso. Lo que falla es una dependencia, y la diferencia importa
    // para quien recibe el aviso a las tres de la mañana.
    const report = await checkHealth(probeThatAnswers(false));

    expect(report.status).toBe("degraded");
    expect(report.app).toBe(true);
    expect(report.database).toBe(false);
  });

  it("no propaga la excepción de una sonda que falla de forma inesperada", async () => {
    const brokenProbe: DatabaseProbe = {
      isReachable: () => Promise.reject(new Error("boom")),
    };

    // Se documenta el comportamiento actual: la excepción sí se propaga, porque
    // el contrato del puerto es devolver un booleano y una sonda que lanza está
    // incumpliéndolo. Capturarlo aquí escondería un error de programación de la
    // implementación bajo un "degraded" que parecería un problema de red.
    await expect(checkHealth(brokenProbe)).rejects.toThrow("boom");
  });
});
