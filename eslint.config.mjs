import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Reglas propias del proyecto.
  {
    rules: {
      // Prohibido `any` sin justificar. Ver CLAUDE.md, seccion 5.
      "@typescript-eslint/no-explicit-any": "error",
      // Variables sin usar: error, salvo que el nombre empiece por guion bajo.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Nada de errores silenciados ni depuracion olvidada.
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Scripts de linea de comandos: aqui `console.log` es la salida del programa,
  // no depuracion olvidada.
  {
    files: ["scripts/**/*.{mjs,ts}"],
    rules: {
      "no-console": "off",
    },
  },

  // -------------------------------------------------------------------------
  // Regla de dependencia entre capas (ADR-001).
  //
  // Documentarla no basta: aqui se hace exigible. Una importacion prohibida
  // falla el lint, y por tanto `pnpm check` y la CI.
  //
  // Limitacion conocida: `no-restricted-imports` solo inspecciona el
  // especificador de la importacion. No detecta `require()` ni un
  // `await import()` con una ruta construida en tiempo de ejecucion. Para lo
  // que se pretende evitar aqui --que el dominio acabe conociendo el framework
  // sin que nadie se de cuenta-- es suficiente.
  // -------------------------------------------------------------------------

  // `domain`: logica pura. No conoce framework, ni base de datos, ni la
  // libreria de repeticion espaciada, ni ninguna otra capa.
  {
    files: ["src/**/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "El dominio no conoce React (ADR-001). Si necesitas esto aqui, la logica esta en la capa equivocada.",
            },
            {
              group: ["next", "next/*", "server-only", "client-only"],
              message: "El dominio no conoce Next.js (ADR-001).",
            },
            {
              group: ["@supabase/*", "ts-fsrs"],
              message:
                "El dominio no conoce Supabase ni ts-fsrs (ADR-001 y ADR-003). Se accede a ellos a traves de un puerto.",
            },
            {
              group: [
                "**/application/**",
                "**/infrastructure/**",
                "**/presentation/**",
                "@/**/application/**",
                "@/**/infrastructure/**",
                "@/**/presentation/**",
              ],
              message: "El dominio esta en el centro: no depende de ninguna otra capa (ADR-001).",
            },
          ],
        },
      ],
    },
  },

  // `application`: coordina casos de uso y depende de puertos. No conoce el
  // framework ni las implementaciones concretas.
  {
    files: ["src/**/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*", "next", "next/*"],
              message:
                "La capa de aplicacion no conoce el framework (ADR-001). Un caso de uso debe poder probarse sin navegador.",
            },
            {
              group: ["@supabase/*", "ts-fsrs"],
              message:
                "La aplicacion depende de puertos, no de implementaciones concretas (ADR-001, ADR-002, ADR-003).",
            },
            {
              group: [
                "**/infrastructure/**",
                "**/presentation/**",
                "@/**/infrastructure/**",
                "@/**/presentation/**",
              ],
              message:
                "Las dependencias apuntan hacia dentro: la aplicacion no importa infraestructura ni presentacion (ADR-001).",
            },
          ],
        },
      ],
    },
  },

  // `presentation` y las rutas de App Router: transforman peticiones en
  // comandos y consultas. No hablan con la infraestructura directamente.
  {
    files: ["src/**/presentation/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/infrastructure/**", "@/**/infrastructure/**"],
              message:
                "La presentacion llama a un caso de uso, no a un repositorio (ADR-001). Nada de SQL ni de clientes de base de datos en un componente o una ruta.",
            },
          ],
        },
      ],
    },
  },

  // Debe ir el ultimo: desactiva las reglas de ESLint que chocan con Prettier.
  prettier,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "src/shared/infrastructure/supabase/database.types.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
