# LEX-1.14 — Verificar clon limpio y cerrar M1

**Fecha:** 2026-08-28
**Rama:** `docs/lex-1-14-clean-clone-m1` — PR [#3](https://github.com/JoanOliver04/lexora/pull/3)
**Estado resultante:** `HECHO` — cierra el hito **M1**

---

## 1. Qué se verifica y por qué sobre un clon

M1 exige una cosa concreta: que un clon limpio del repositorio se instale,
levante la base de datos, pase las pruebas y compile **con los comandos
documentados y sin nada que solo exista en la máquina del desarrollador**.

Por eso la comprobación no se hizo sobre el árbol de trabajo, sino sobre un `git
clone` recién sacado de GitHub en `C:\Temp\lex114`, en el commit `451d668`
(`main`, el mismo que cerró LEX-1.13). Trabajar sobre el árbol existente habría
demostrado que funciona aquí, que no es lo que se pregunta.

## 2. Secuencia ejecutada y resultado real

Todo desde `C:\Temp\lex114`, con Node 24.19.0 y pnpm 11.24.0.

| Paso | Comando | Resultado |
|---|---|---|
| Dependencias | `pnpm install --frozen-lockfile` | 500 paquetes, lockfile coincide con `package.json`, `Done` |
| Base de datos | `pnpm db:start` | Stack en marcha; imprime `API_URL` y `PUBLISHABLE_KEY` |
| Entorno | `cp .env.example .env.local` + pegar los dos valores | Plantilla correcta; la app arranca con ellos |
| Esquema | `pnpm db:reset` | `Reset local database.` — **0 migraciones** (todavía no existen), semilla vacía aplicada; el mecanismo se ejerce entero |
| pgTAP | `pnpm db:test` | `All tests successful. Files=2, Tests=2 … Result: PASS` |
| Puertas de calidad | `pnpm check` | **exit 0** (detalle abajo) |
| Extremo a extremo | `pnpm e2e` | `14 passed (18.1s)` — escritorio Chromium + Poco F5 |
| Aplicación | `pnpm start` + `curl` | `/` → 307 → `/es`; `/es` → 200 `lang="es"`; `/api/health` → 200 `{"status":"ok","app":true,"database":true}` |

### `pnpm check` en detalle

```text
$ prettier --check .        All matched files use Prettier code style!
$ eslint                    (sin hallazgos)
$ next typegen && tsc --noEmit   ✓ Types generated successfully
$ node scripts/check-contrast.mjs
  Autocomprobacion blanco/negro: 21.00:1  ✓
  ✓ Todas las combinaciones cumplen el minimo exigido.   (18/18)
$ vitest run               Test Files  3 passed (3)   Tests  17 passed (17)
$ next build               ✓ Compiled successfully
  Route (app):  /_not-found · /[locale] (/es, /en) · ƒ /api/health
[exited with code 0]
```

## 3. CI verde registrada

Dos ejecuciones cuentan aquí:

```text
run 33103009623   CI   main   push          success   2m39s   commit 451d668  (cierre de LEX-1.13)
run 33170219084   CI   docs/lex-1-14-…      success   2m45s   PR #3           (esta tarea)
```

Los tres trabajos —Calidad, Base de datos, Extremo a extremo— en verde en ambas.
Es la prueba del camino desde cero real: un runner Linux frío, sin imágenes de
Docker, sin store de pnpm y sin navegadores de Playwright en caché. El run del PR
cubre además los cambios de documentación de esta tarea.

## 4. Límites de la comprobación local

Se declaran en lugar de dejar que el resultado local aparente más de lo que
demuestra:

- **La máquina ya estaba configurada.** Tenía las imágenes de Docker, el store de
  pnpm y los navegadores de Playwright en caché (todos por usuario, no por
  proyecto). El clon local prueba *reproducibilidad en una máquina ya
  preparada*; el camino desde nada lo cubre la CI (§3).
- **`pnpm db:start` arrancó desde un backup.** El proyecto de la CLI de Supabase
  es único por máquina (`project_id = "lexora"` versionado), así que el clon se
  conecta a los mismos volúmenes que el árbol de trabajo. El `pnpm db:reset`
  posterior recrea la base entera desde migraciones y semilla, de modo que el
  estado final sí es limpio; una máquina fría arrancaría vacía.
- **`database.types.ts` no se regeneró en local.** La correspondencia con el
  esquema la comprueba la CI byte a byte en cada ejecución.

## 5. Hallazgos de la auditoría

La tarea es una auditoría; su valor son los muros que encuentra un recién
llegado. Se corrigieron en el árbol principal y se re-verificaron desde un
**segundo** clon limpio (§6).

### Corregidos en esta rama (archivos versionados)

1. **`README.md` no tenía instrucciones de instalación.** El criterio dice
   «compilar siguiendo README» y un clon no se podía arrancar leyéndolo. Añadida
   una sección mínima «Puesta en marcha local». El README de portfolio completo
   (objetivo, capturas, arquitectura, aportación personal) sigue siendo **LEX-10.4
   y queda abierto**.
2. **`README.md` afirmaba «Fase 0 de 10. Todavía no hay aplicación ejecutable».**
   Falso: la aplicación compila y arranca. Corregido a Fase 1, sin demo pública.
3. **`docs/STATUS.md`** describía un estado anterior a FASE 1: «Trabajo todavía
   abierto» listaba LEX-0.3…0.8 como `PENDIENTE` (FASE 0 está `HECHO` 8/8 con
   evidencia por tarea); la línea de cabecera del estado estaba truncada
   («LEX-1.1 a LEX-1.11 HECHO, salvo LEX-1.12 a LEX-1.14»); las verificaciones
   manuales 1–2 (Q-003, Q-004) ya estaban resueltas; «Estado de git» decía «sin
   push ni fetch» y listaba solo ficheros de documentación como versionados.
   Reescrito para reflejar el cierre de M1.

La jerarquía documental (`ROADMAP.md` §4) sitúa el roadmap por encima de
`STATUS.md`, así que la divergencia se resolvió sin abrir un `Q-nnn`: `STATUS.md`
estaba obsoleto y se actualizó.

### Corregidos en el roadmap privado (no versionado)

4. Cabecera de FASE 1 decía `PENDIENTE (0/14)` frente a sus propias filas (13
   `HECHO`) y a §7 (`EN PROCESO` 13/14).
5. §6 «Siguiente tarea recomendada» seguía mostrando *LEX-1.7 — BLOQUEADA POR
   Q-003*, resuelta el 2026-08-27. Reescrita para apuntar a LEX-2.1.
6. Fechas de «Última actualización» descoordinadas (2026-08-26 frente a
   2026-08-27 en la misma sección).
7. Contadores de §5 y §11 recalculados desde los estados; §10 M1 → `HECHO`;
   entrada añadida en §14.

### Observación de entorno (no es un defecto del repositorio)

8. En esta máquina hay un Node 22.22.2 propio en `C:\Program Files\nodejs` que
   tapa el shim de nvm-windows (`C:\nvm4w\nodejs`), y `nvm use` no cambia la
   versión en una terminal sin privilegios. `.nvmrc` y `engines.node` piden
   `24.x`. La auditoría se ejecutó forzando el `PATH` a la carpeta de nvm. No
   afecta al clon; es una peculiaridad de la máquina, anotada para no volver a
   tropezar con ella.

### Hallazgos positivos

- **`.gitattributes` hace su trabajo en un checkout de Windows.** `prettier
  --check` pasa limpio en un clon recién sacado, sin ruido de CRLF —el sitio
  clásico donde aparece—.
- **`.env.example` documenta con precisión** el flujo `db:start` → `.env.local`.
  Un recién llegado no necesita adivinar el nombre del fichero ni de dónde salen
  los valores.

## 6. Re-verificación desde un segundo clon

Un arreglo validado solo en el árbol de trabajo no está demostrado para quien
clona. Los arreglos de archivos versionados se probaron sobre un **segundo** clon
independiente (`C:\Temp\lex114b`) de la rama `docs/lex-1-14-clean-clone-m1`,
siguiendo **solo** el README corregido:

```text
git clone -b docs/lex-1-14-clean-clone-m1 <repo> lex114b
pnpm install --frozen-lockfile     Done in 16.5s
pnpm db:start                      stack arriba; imprime PUBLISHABLE_KEY
.env.local con los tres valores    (cp .env.example .env.local + pegar)
pnpm db:reset                      Reset local database.
pnpm check                         exit 0 (build ✓, rutas /es /en ƒ/api/health)
pnpm e2e                           14 passed (16.1s)
```

El primer clon (§2) se hizo desde GitHub; este segundo se sacó del repositorio
local para probar la rama antes de empujarla. La CI de la rama (run
`33170219084`, PR #3) volvió a ejecutar `pnpm check` y `pnpm e2e` sobre el
contenido final, en verde.

## 7. Estado de M1

Las catorce tareas de FASE 1 están `HECHO`. El hito **M1 — Fundación técnica
reproducible** queda cerrado: clon limpio instalable, base recreable desde cero,
puertas de calidad en verde, build de producción, smoke E2E y CI verde
registrada, tanto sobre `main` como sobre la rama de cierre.

El cierre siguió la secuencia acordada: auditoría a ciegas → correcciones en la
rama → re-verificación desde un segundo clon → push, PR #3, CI verde → merge a
`main` → etiqueta `v0.2.0-m1`.

Siguiente tarea desbloqueada: **LEX-2.1** — primera migración (`profiles`,
`languages`, `courses`, `course_settings`). No se inicia aquí.

## 8. Fuera de alcance

- README de portfolio completo → LEX-10.4.
- Base de datos aislada para previews → LEX-10.6.
- Firefox y WebKit en E2E → cuando el coste sea razonable.
- Etiqueta `v0.2.0-m1`: creada y empujada al cerrar M1, con autorización explícita
  de Joan (la de Q-004 cubría solo el primer push).
