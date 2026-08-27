# LEX-1.2 — Calidad base y scripts canónicos

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-2-quality-scripts`
**Estado resultante:** `HECHO`, con una deuda registrada.

---

## 1. Scripts canónicos

| Script | Comando |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `eslint` |
| `lint:fix` | `eslint --fix` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `typecheck` | `next typegen && tsc --noEmit` |
| `check` | Los cuatro anteriores en cadena |

`typecheck` ejecuta **`next typegen` antes** de `tsc`. Es el arreglo del hallazgo
de LEX-1.1: Next.js genera los tipos de rutas y layouts en `.next/types/`, y el
layout raíz los usa. Sin ese paso previo, la comprobación falla en cualquier
entorno limpio con `Cannot find name 'LayoutProps'`.

`check` existe para poder ejecutar la puerta completa con un solo comando, en
local y en la CI.

**No se añade `test`.** Vitest llega en LEX-1.9. Un script que no puede ejecutarse
no es calidad, es ruido: o falla y se normaliza que la puerta esté en rojo, o
miente y devuelve éxito sin haber probado nada. Se añadirá con la herramienta.
Desviación respecto al criterio original de la tarea, registrada en el roadmap.

## 2. TypeScript

Sobre `strict: true`, que ya venía activado:

| Opción | Qué evita |
|---|---|
| `noUncheckedIndexedAccess` | Que `array[i]` se trate como si siempre existiera. Relevante en la cola diaria y en el parser de importación, donde se indexa por posición. |
| `exactOptionalPropertyTypes` | Que `{ dueAt: undefined }` y la ausencia de `dueAt` se confundan. Importa en un dominio donde «sin fecha» y «fecha desconocida» no son lo mismo. |
| `noImplicitOverride` | Sobrescrituras accidentales al renombrar. |
| `noFallthroughCasesInSwitch` | Caídas entre casos en las máquinas de estado de FSRS. |
| `noPropertyAccessFromIndexSignature` | Acceso por punto a claves que el tipo no garantiza. |
| `forceConsistentCasingInFileNames` | Importaciones que funcionan en Windows y fallan en Linux. La CI corre en Linux. |

`target` subido de `ES2017` a `ES2022`. Justificación: Next.js documenta soporte
para Chrome 111+, Edge 111+, Firefox 111+ y Safari 16.4+, todos con ES2022
completo. Transpilar a ES2017 generaría código más largo sin ningún navegador que
lo necesite.

Las seis opciones y el cambio de `target` pasan `tsc --noEmit` y el build sin
tocar el código generado por la plantilla.

## 3. Prettier

Versión 3.9.6, con `eslint-config-prettier` 10.1.8 aplicado **el último** en la
configuración de ESLint, para desactivar las reglas que se pelean con el
formateador.

Configuración: punto y coma, comillas dobles, coma final en todo, 100 columnas,
dos espacios, finales de línea LF.

### Markdown queda fuera del formateador

Decisión tomada tras probarlo, no por costumbre.

Al ejecutar `prettier --write .` por primera vez, el formateador **alineó todas
las tablas Markdown** rellenando cada celda con espacios hasta el ancho de la más
larga. El resultado se renderiza exactamente igual en GitHub, pero cambiar una
sola celda reformatea la tabla entera.

`docs/STATUS.md` se reescribe en cada tarea y está lleno de tablas. Con Prettier
activo, un cambio de tres líneas producía un diff de 134. Eso destruye la
revisabilidad del historial a cambio de nada visible.

**El código se formatea. La documentación se escribe a mano.** El motivo queda
escrito en `.prettierignore` para que nadie lo revierta pensando que fue un olvido.

## 4. Reglas propias de ESLint

| Regla | Nivel | Motivo |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | error | `CLAUDE.md` prohíbe `any`. Una regla lo hace exigible; una norma escrita, no. |
| `@typescript-eslint/no-unused-vars` | error | Con excepción para nombres que empiezan por `_`, que es la forma de decir «esto sobra a propósito». |
| `no-console` | warn | Permite `console.warn` y `console.error`. Evita que quede depuración olvidada sin bloquear el desarrollo. |

## 5. ESLint 10: probado y descartado

pnpm marca ESLint 9.39.5 como obsoleta. La comprobación del motivo:

```text
npm view eslint@9.39.5 deprecated
This version is no longer supported. Please see https://eslint.org/version-support
```

No es ese parche: **toda la línea 9.x está fuera de soporte**, y 9.39.5 es la
última que existe. Eso sí justifica intentar la subida, así que se intentó.

`eslint-config-next@16.3.3` declara `eslint: ">=9.0.0"`, de modo que la 10 entra
en el rango. Pero al ejecutarla:

```text
TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function
  at eslint-plugin-react@7.37.5/lib/util/version.js:31
```

`eslint-plugin-react`, que arrastra `eslint-config-next`, usa una API que ESLint
10 ha eliminado. El rango de dependencias lo permite; la realidad, no.

**Se vuelve a 9.39.5**, que pasa el lint sin incidencias.

### Deuda registrada

| Campo | Valor |
|---|---|
| Qué | El linter corre sobre una línea sin soporte: no recibirá correcciones de seguridad. |
| Riesgo | Bajo. ESLint es una herramienta de desarrollo, no se despliega, y no procesa entrada no confiable. |
| Bloqueante | `eslint-plugin-react` compatible con ESLint 10. |
| Cuándo revisar | Al actualizar Next.js, o antes del endurecimiento de LEX-9.9. |
| Cómo comprobar | Reintentar `pnpm add -D eslint@10` y ejecutar `pnpm lint`. Si pasa, adoptar. |

## 6. Verificaciones ejecutadas

```text
pnpm format        reformateó el código; la documentación quedó excluida
pnpm format:check  All matched files use Prettier code style!
pnpm lint          exit=0
pnpm typecheck     Generating route types... ✓  →  tsc exit=0
pnpm build         exit=0   Compiled successfully in 6.8s
pnpm check         exit=0   (los cuatro en cadena)
```

## 7. Fuera de alcance

- Vitest y el script `test` → LEX-1.9.
- Reglas de dependencia entre capas → LEX-1.3.
- Ejecución de estas puertas en la CI → LEX-1.12.
