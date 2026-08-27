# LEX-1.9 — Vitest y React Testing Library

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-9-vitest`
**Estado resultante:** `HECHO`. Cierra la deuda que dejó LEX-1.3.

---

## 1. Configuración

`vitest@4.1.11` con React Testing Library, `jest-dom` y `user-event`.

**Entorno `node` por defecto, `jsdom` a petición.** La mayor parte del código de
Lexora —dominio, casos de uso, parsers, cola diaria— no necesita un DOM, y
levantarlo en cada fichero cuesta tiempo en cada ejecución. Los tests de
componentes lo piden con un comentario `@vitest-environment jsdom` en su
cabecera.

Cobertura limitada a `src/modules`, `src/shared` y `src/env`. Incluir la
configuración y las rutas de Next.js produciría un porcentaje bonito y sin
significado. **No se fija umbral todavía:** `MASTER_SPEC.md` pide un mínimo del
80 % en dominio y aplicación, y hoy no existe ese código. Un umbral sobre
infraestructura no diría nada.

### Dos avisos de Vitest, atendidos

1. `vitest.config.ts` se cargaba como CommonJS. Renombrado a **`.mts`**.
2. `vite-tsconfig-paths` es redundante: Vite ya resuelve los alias de
   `tsconfig.json` de forma nativa con `resolve.tsconfigPaths`. **Dependencia
   eliminada.**

## 2. La deuda de LEX-1.3, cerrada

LEX-1.3 hizo exigible la regla de dependencia entre capas, pero la comprobación
fue **manual**: se escribieron ficheros que la violaban, se vio fallar el lint y
se borraron. Eso demuestra que funcionaba aquel día. No impide que un cambio
futuro en `eslint.config.mjs` la desactive sin que nadie lo note.

Una regla de arquitectura que ha dejado de aplicarse en silencio es peor que no
tenerla: da una seguridad que ya no existe.

`tests/unit/architecture/layer-rules.test.ts` ejecuta ESLint mediante su API de
Node sobre código que viola la regla, y exige que falle. **No comprueba el código
del proyecto: comprueba la regla.**

Once casos, incluidos los que deben pasar:

| Capa | Se comprueba que no puede | Y que sí puede |
|---|---|---|
| `domain` | React, Next.js, Supabase, `ts-fsrs`, otras capas por ruta relativa y por alias | importar dentro de su propia capa |
| `application` | el framework, implementaciones concretas | importar del dominio |
| `presentation` y rutas | llamar a un repositorio | llamar a un caso de uso |

### El test se probó rompiendo la regla

Un test de regresión que nunca ha fallado no está probado. Se neutralizó el
bloque de reglas del dominio desviando su patrón de ficheros:

```text
Con la regla neutralizada:
  Test Files  1 failed | 1 passed (2)
       Tests  4 failed | 10 passed (14)

Con la regla restaurada:
  Test Files  2 passed (2)
       Tests  14 passed (14)
```

Fallan **exactamente** los cuatro casos del dominio, y ninguno más. La
configuración se restauró desde copia.

*Nota de método:* el primer intento de neutralizar la regla no funcionó. Se
insertó una segunda clave `rules` en el mismo objeto, y en un literal de
JavaScript la última gana, así que la regla real seguía activa y los tests
seguían pasando. **Un experimento que "sale bien" a la primera merece
sospecha:** aquí el resultado esperado era el fallo, y verlo pasar fue lo que
delató el error del propio experimento.

## 3. Arnés de componentes

`button.test.tsx` existe sobre todo para demostrar que jsdom, Testing Library,
los matchers y la limpieza entre tests funcionan. Sin él, la instalación quedaría
sin probar.

Comprueba además tres cosas que sí importan: que `Button` es de tipo `button` y
no `submit`, que no ejecuta su acción cuando está deshabilitado, y que se
encuentra por su nombre accesible.

La limpieza entre tests se hace con importación dinámica de
`@testing-library/react`, porque el fichero de preparación se carga también en
los tests de entorno `node`, donde no hay DOM.

## 4. Scripts

| Script | Qué hace |
|---|---|
| `pnpm test` | Una ejecución. |
| `pnpm test:watch` | Modo continuo. |
| `pnpm test:coverage` | Con informe de cobertura. |

`test` se ha añadido a `pnpm check`, entre `contrast` y `build`. Queda saldada la
desviación registrada en LEX-1.2, donde se pospuso deliberadamente en vez de
crear un script que no podía ejecutarse.

## 5. Verificaciones ejecutadas

```text
pnpm test           14 tests, 2 ficheros, exit=0
pnpm format:check   exit=0
pnpm lint           exit=0
pnpm typecheck      exit=0
pnpm contrast       exit=0
pnpm build          exit=0
pnpm check          exit=0
```
