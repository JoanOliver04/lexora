import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Extension `.mts` a proposito: con `.ts`, Vite carga este fichero como
 * CommonJS y avisa de que la sintaxis ESM dejara de funcionar en una version
 * mayor futura.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resuelve el alias `@/*` desde `tsconfig.json`. Vite lo hace de forma
    // nativa; `vite-tsconfig-paths` ya no hace falta.
    tsconfigPaths: true,
  },
  test: {
    // Dos entornos en el mismo proyecto: la mayor parte del codigo de Lexora
    // --dominio, casos de uso, parsers, cola diaria-- no necesita un DOM, y
    // levantarlo en cada fichero cuesta tiempo en cada ejecucion. Los tests de
    // componentes lo piden con un comentario `@vitest-environment jsdom` en su
    // cabecera.
    environment: "node",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Solo se mide lo que tiene sentido medir. Incluir configuracion y rutas
      // de Next.js produce un porcentaje bonito y sin significado.
      include: ["src/modules/**/*.ts", "src/shared/**/*.ts", "src/env/**/*.ts"],
      exclude: ["**/*.test.*", "**/*.d.ts", "**/index.ts"],
      // `MASTER_SPEC.md` fija un minimo del 80 % en dominio y aplicacion, no
      // una cobertura global alta. El umbral se activara cuando exista ese
      // codigo; hoy solo hay infraestructura y el numero no diria nada.
    },
  },
});
