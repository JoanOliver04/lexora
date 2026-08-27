import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";

/**
 * Limpieza entre tests.
 *
 * Sin esto, los componentes renderizados por un test siguen en el documento
 * durante el siguiente, y una consulta como `getByRole("button")` encuentra dos
 * elementos y falla con un mensaje que no señala la causa real.
 *
 * La importación es dinámica porque este fichero se carga también en los tests
 * que corren en `node`, donde no hay DOM y `@testing-library/react` no puede
 * cargarse.
 */
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
