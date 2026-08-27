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

  // Debe ir el ultimo: desactiva las reglas de ESLint que chocan con Prettier.
  prettier,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
