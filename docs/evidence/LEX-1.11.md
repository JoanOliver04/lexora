# LEX-1.11 — Configurar Playwright

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-11-playwright`
**Estado resultante:** `HECHO`

---

## 1. Configuración

`@playwright/test@1.62.1`, con Chromium instalado.

### Dos perfiles de dispositivo

| Perfil | Qué es |
|---|---|
| `escritorio-chromium` | Chrome de escritorio. |
| `movil-poco-f5` | 393×873 px CSS, densidad 2.75. |

El segundo **no** es un perfil genérico de móvil. El Poco F5 es el dispositivo
Android real donde se va a usar Lexora a diario, y su pantalla de 1080×2400 con
densidad 2.75 da exactamente esos 393×873 píxeles CSS.

Los fallos de diseño responsive aparecen en anchos concretos. Probar en 375 o en
412 no dice nada sobre el teléfono en el que esto se va a usar de verdad.

### Se prueba contra el build de producción

`webServer` ejecuta `pnpm build && pnpm start`, no `pnpm dev`. Difieren en
renderizado estático, división de código y manejo de errores, y lo que importa es
que funcione lo que se despliega.

### Ajustes para la CI

| Opción | En CI | En local | Motivo |
|---|---|---|---|
| `forbidOnly` | sí | no | Un `test.only` olvidado haría pasar la suite ejecutando un solo test. |
| `retries` | 1 | 0 | Un reintento absorbe inestabilidad de red y arranque. En local, ninguno, para que un test inestable se note en vez de esconderse. |
| `workers` | 1 | omitido | Ver más abajo. |
| `trace` | en el primer reintento | ídem | Guardarla siempre llena el disco y ralentiza cada ejecución. |

## 2. `exactOptionalPropertyTypes` se ganó el sueldo

La primera versión escribía:

```ts
workers: process.env["CI"] ? 1 : undefined,
```

Y el build falló:

```text
playwright.config.ts(19,29): error TS2769: No overload matches this call.
  Types of property 'workers' are incompatible.
    Type 'undefined' is not assignable to type 'string | number'.
```

La opción, activada en LEX-1.2, distingue **omitir una clave** de **asignarle
`undefined`**, y tiene razón: «no he dicho nada» y «he dicho explícitamente que no
hay valor» no significan lo mismo. Playwright no acepta `undefined` ahí.

Corregido omitiendo la clave:

```ts
...(process.env["CI"] ? { workers: 1 } : {}),
```

Es un ejemplo pequeño y concreto de una opción estricta atrapando un error real en
la primera semana, en lugar de ser una molestia teórica.

## 3. Los tests

Seis casos, ejecutados en los dos dispositivos: **12 pasadas**.

| Test | Qué protege |
|---|---|
| Cada idioma sirve su contenido y su `lang` | Que `lang` coincida con lo servido, y que los dos idiomas **no** sirvan el mismo texto: si lo hicieran, el atributo correcto no significaría nada. |
| La raíz redirige | Que `/` no dé un 404. |
| Un idioma inexistente da 404 | Que `/fr` no dé una página en blanco ni un error de servidor. |
| Cambiar de idioma conserva la página | Que el conmutador no expulse al usuario a la raíz. |
| El tema sobrevive a una recarga | Que el script síncrono del `<head>` funcione. Se comprueba además que la preferencia quedó marcada, porque el atributo por sí solo pasaría igual con un destello. |
| Sin errores de consola | Un error de consola en la carga inicial es casi siempre un fallo de hidratación. |

Salida:

```text
Running 12 tests using 2 workers
  ✓ 12 tests, escritorio-chromium y movil-poco-f5
  12 passed (12.9s)
```

## 4. Alcance

No hay producto todavía, así que estos tests no comprueban aprendizaje: comprueban
que la base sobre la que se va a construir funciona en un navegador real. Son los
que deben seguir pasando cuando se añada todo lo demás.

Solo Chromium por ahora. Firefox y WebKit se añadirán en la CI cuando el coste sea
razonable, según pide `MASTER_SPEC.md`; instalarlos ya solo alarga cada ejecución
local sin cubrir nada que hoy pueda romperse.

## 5. Verificaciones ejecutadas

```text
pnpm e2e            12 passed (12.9s)
pnpm typecheck      exit=0
pnpm check          exit=0
```
