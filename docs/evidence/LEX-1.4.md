# LEX-1.4 — Validación de entorno con Zod

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-2-quality-scripts`
**Estado resultante:** `HECHO`

---

## 1. Qué se ha construido

| Archivo | Papel |
|---|---|
| `src/env/server.ts` | Variables privadas. Importa `server-only`. |
| `src/env/client.ts` | Variables `NEXT_PUBLIC_*`. Públicas por definición. |
| `src/env/shared.ts` | Formateo de errores y escotilla de validación. |
| `src/env/env.d.ts` | Declaración de tipos de las variables públicas. |
| `.env.example` | Plantilla documentada, sin un solo valor real. |

Se validan **al cargar el módulo**, no en la primera petición que use la variable.
Es preferible que la aplicación no arranque a que arranque mal y falle media hora
después con un `undefined` a mitad de una consulta.

Dependencias añadidas: `zod@4.4.3` y `server-only@0.0.1`. La segunda es el
mecanismo que documenta Next.js para esto; no se ha añadido ninguna librería de
configuración de terceros, porque el problema se resuelve en unas sesenta líneas
que además se pueden explicar.

## 2. La separación servidor/cliente, comprobada

Esta tarea decide qué puede ver el navegador. Un error aquí no produce un fallo
visible: produce una clave publicada. Así que se comprobó, en lugar de darse por
hecho.

### Prueba 1 — Una variable de servidor no llega al bundle

Se añadió al esquema de servidor una variable temporal con un valor reconocible,
se consumió desde un Server Component y se construyó la aplicación.

```text
pnpm build                                   exit=0

Búsqueda de "ZZTOPSECRETPROBE9137" en .next/static
  → Sin coincidencias: el secreto NO llega al navegador

Búsqueda en todo .next (*.js, *.json, *.html)
  → En ningún sitio
```

No aparece ni siquiera en los artefactos de servidor, porque se lee en tiempo de
ejecución en vez de incrustarse en el build. Es el comportamiento correcto.

### Prueba 2 — Importarlo desde un Client Component rompe el build

Se creó un componente con `"use client"` que importaba `serverEnv` y se construyó.

```text
Import traces:
  Client Component Browser:
    ./src/env/server.ts [Client Component Browser]
    ./src/app/probe-client.tsx [Client Component Browser]
    ./src/app/probe-client.tsx [Server Component]
    ./src/app/page.tsx [Server Component]

build exit=1
```

Falla con la traza completa de importación, que además señala **quién** provocó la
fuga. Sin `import "server-only"`, ese mismo código habría compilado sin una sola
advertencia y habría publicado el valor.

Ambas sondas se retiraron. `pnpm check` en verde después.

## 3. Un choque real entre dos cosas que queremos

`noPropertyAccessFromIndexSignature`, activado en LEX-1.2, obliga a escribir
`process.env["FOO"]` para cualquier clave no declarada. Pero Next.js sustituye
`process.env.NEXT_PUBLIC_FOO` por su valor **de forma textual**, y la forma
documentada es el acceso por punto.

El primer intento dio:

```text
src/env/client.ts(25,39): error TS4111: Property 'NEXT_PUBLIC_SITE_URL' comes
from an index signature, so it must be accessed with ['NEXT_PUBLIC_SITE_URL'].
```

La salida fácil habría sido desactivar la opción. En su lugar, `src/env/env.d.ts`
declara las variables públicas como propiedades reales: el acceso por punto deja
de venir de una firma de índice y las dos condiciones se cumplen.

**Las variables de servidor no se declaran ahí a propósito.** Obligar a
`process.env["LO_QUE_SEA"]` para ellas es un recordatorio permanente de que no son
intercambiables con las públicas.

## 4. La escotilla `SKIP_ENV_VALIDATION`

Existe por un caso real: construir en un contenedor o en un paso de CI que solo
compila y no ejecuta nada, donde las variables de producción no están —ni deben
estar— disponibles.

Está documentada en `.env.example` con la advertencia de que **jamás** debe
activarse en un entorno que sirva tráfico: si se activa, cada variable queda con
su valor por defecto y el fallo aparece más tarde y peor.

## 5. Estado de las variables

Hoy hay dos: `NODE_ENV` en servidor y `NEXT_PUBLIC_SITE_URL` en cliente. Es poco,
y es correcto: **el entregable es el mecanismo**. Las de Supabase se añadirán en
LEX-1.7, cuando exista el proyecto local y se sepan sus nombres reales. Están
dejadas comentadas en `.env.example` para que no haya que recordar dónde van.

Inventar ahora los nombres de unas variables que aún no existen habría producido
un esquema que valida contra una suposición.

## 6. Verificaciones ejecutadas

```text
pnpm format:check   All matched files use Prettier code style!
pnpm lint           exit=0
pnpm typecheck      exit=0
pnpm build          exit=0
pnpm check          exit=0
```

## 7. Nota de método

Las dos sondas se escribieron primero desde PowerShell, y `Set-Content` corrompió
los acentos del archivo: Windows PowerShell 5.1 lee UTF-8 sin BOM como ANSI. Se
restauró desde copia y se rehízo con una herramienta que respeta la codificación.

Queda anotado porque volverá a pasar: **en este repositorio, los archivos con
texto en español no se editan con `Get-Content`/`Set-Content`.**
