# LEX-1.3 — Estructura modular y reglas de dependencia

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-2-quality-scripts`
**Estado resultante:** `HECHO`

---

## 1. El entregable que importa

No es el árbol de directorios. Es que **la regla de dependencia falle el lint**.

Una regla documentada depende de que alguien la recuerde durante una revisión.
Una regla en `eslint.config.mjs` falla `pnpm check` y la CI, y no se puede
ignorar sin dejar rastro en el diff.

## 2. Reglas implementadas

Mediante `no-restricted-imports` con tres grupos de ficheros:

| Capa | Prohibido importar |
|---|---|
| `src/**/domain/**` | React, React DOM, Next.js, `server-only`, `client-only`, `@supabase/*`, `ts-fsrs`, y cualquier `application`, `infrastructure` o `presentation` |
| `src/**/application/**` | React, Next.js, `@supabase/*`, `ts-fsrs`, y cualquier `infrastructure` o `presentation` |
| `src/**/presentation/**` y `src/app/**` | Cualquier `infrastructure` |

Cada prohibición lleva un mensaje que explica **por qué** y remite al ADR. Un
error de lint que solo dice «restricted from being used» obliga a buscar; uno que
dice «el dominio no conoce Next.js (ADR-001)» enseña la regla en el momento en que
se rompe.

Los patrones cubren las dos formas de escribir la importación: la relativa
(`../infrastructure/repo`) y la del alias (`@/modules/x/infrastructure/repo`).

### Limitación conocida, y por qué se acepta

`no-restricted-imports` solo inspecciona el especificador de la importación. No
detecta `require()` ni un `await import()` con una ruta construida en tiempo de
ejecución.

Se acepta: lo que esta regla previene es que el dominio acabe conociendo el
framework **sin que nadie se dé cuenta**. Alguien decidido a saltársela con una
importación dinámica lo está haciendo a propósito, y eso es un problema de
revisión, no de herramienta. La alternativa —`eslint-plugin-boundaries`— añade una
dependencia y un modelo de configuración propio para cubrir un caso que no se ha
dado nunca.

## 3. Verificación: la regla se probó rompiéndola

Se crearon tres ficheros con violaciones deliberadas y se ejecutó el lint.

```text
src/modules/_probe/application/probe.ts
  1:1  error  '@supabase/supabase-js' import is restricted from being used by a pattern.
              La aplicacion depende de puertos, no de implementaciones concretas
              (ADR-001, ADR-002, ADR-003)

src/modules/_probe/domain/probe.ts
  1:1  error  'next/navigation' import is restricted from being used by a pattern.
              El dominio no conoce Next.js (ADR-001)
  2:1  error  '../infrastructure/repo' import is restricted from being used by a pattern.
              El dominio esta en el centro: no depende de ninguna otra capa (ADR-001)

src/modules/_probe/presentation/probe.ts
  1:1  error  '@/modules/_probe/infrastructure/repo' import is restricted from being used
              by a pattern. La presentacion llama a un caso de uso, no a un repositorio
              (ADR-001)

✖ 4 problems (4 errors, 0 warnings)
lint exit=1
```

Las cuatro violaciones detectadas, incluidas ambas formas de escribir la ruta.
Los ficheros de prueba se eliminaron después.

**Pendiente para LEX-1.9:** convertir esto en una regresión automática. Ahora
mismo la comprobación es manual y reproducible, pero nada impide que un cambio
futuro en la configuración desactive la regla sin que se note. Con Vitest
instalado, un test que ejecute ESLint sobre ficheros de fixture y espere estos
errores lo cerraría.

## 4. Estructura creada

```text
src/
  app/        (existente)
  modules/    README.md
  shared/     README.md
```

**No se han creado ocho módulos con cuatro capas vacías cada uno.** Serían 32
carpetas que git ni siquiera puede versionar sin rellenarlas con marcadores, y
contradiría lo que dice `ARCHITECTURE.md`: no repetir las cuatro capas en módulos
triviales.

En su lugar, cada directorio lleva un `README.md` que documenta qué módulos
existirán, en qué fase llega cada uno, qué capas puede tener y cuál es la regla de
dependencia. Las carpetas se crean cuando el módulo se implementa.

`src/shared/README.md` fija además el criterio para promover algo a compartido:
que lo necesiten dos módulos **ya**, no que probablemente haga falta. Deshacer una
abstracción compartida que no encajó cuesta mucho más que moverla cuando aparece
el segundo uso.

## 5. Verificaciones ejecutadas

```text
pnpm lint       exit=1 con las violaciones deliberadas  (comportamiento esperado)
pnpm lint       exit=0 tras retirarlas
pnpm check      exit=0   format:check + lint + typecheck + build
```
