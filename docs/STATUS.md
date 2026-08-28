# Lexora — Estado actual

**Última actualización:** 2026-08-28
**Fase actual:** FASE 2 — Identidad, onboarding y curso — `EN PROCESO` (1/11)
**Hito actual:** M2 — Identidad y onboarding aislados — `PENDIENTE`. M1 `HECHO`
**Tarea activa:** **LEX-2.2** — seeds de idiomas; hecha en local, pendiente de push + PR + CI + merge
**Estado de la tarea:** LEX-2.1 `HECHO` · LEX-2.2 `EN PROCESO`
**Rama / commit base / HEAD:** `feat/lex-2-2-language-seeds`, a partir de `main`; sin empujar

> El roadmap detallado y la especificación maestra son documentos privados y
> locales; no forman parte de este repositorio público. Ver
> [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) Q-002.

---

## Terminado en esta sesión

### LEX-2.2 — Seeds de idiomas y curso de referencia — `EN PROCESO`

Informe completo en [`evidence/LEX-2.2.md`](evidence/LEX-2.2.md).

Seed de `languages` en `supabase/seed.sql`: tres filas (`es`/`es`, `en`/`en`,
`en`/`en-GB`) con UUID fijos y `on conflict (code, locale) do nothing` —
determinista e idempotente. El idioma de interfaz no vive en esta tabla (es
`profiles.ui_locale`). Solo local y CI.

**«Curso de referencia»:** no se siembra fila en `courses` (necesita `owner_id`;
lo crea el onboarding en LEX-2.7). Se documenta como definición (ids de idioma,
`target_locale` `en-GB`, `start_level` `A1`, `daily_new_limit` 5). Interpretación
declarada en el informe §1 por si Joan esperaba una fila real.

- `030-languages-seed.sql` (nuevo): 5 asserciones — 3 filas, pares correctos,
  UUID fijo, `on conflict do nothing` no añade filas, las 3 activas.
- `020-…` reescrito para no depender del seed (idiomas sintéticos `zz`); cada
  `throws_like` re-verificado fallando por su constraint.

```text
pnpm db:reset   migración + seed desde vacío; 3 filas con sus UUID fijos
pnpm db:test    4 ficheros, 38 asserciones, PASS
pnpm db:types   sin cambios (el seed no toca el esquema)
pnpm check      exit 0
pnpm e2e        14 passed
```

**Falta para `HECHO`:** push, PR, CI verde, merge.

### LEX-2.1 — Migración de identidad y curso — `HECHO`

Informe completo en [`evidence/LEX-2.1.md`](evidence/LEX-2.1.md). PR #4, CI verde.

Primera migración con tablas: `profiles`, `languages`, `courses`,
`course_settings`. Estructura, claves, CHECK, enums (`ui_locale`, `cefr_level`),
timestamps con trigger de `updated_at`, y un trigger `BEFORE` que exige que
`profiles.timezone` sea un nombre real de `pg_timezone_names`. RLS habilitado en
las cuatro tablas, sin políticas todavía (deniega todo).

**Deliberadamente fuera:** políticas RLS y tests de aislamiento dueño/no-dueño →
LEX-2.3; creación del perfil → LEX-2.4; semillas → LEX-2.2.

**Decisiones:** `languages.locale` NOT NULL (un idioma base guarda `locale =
code`), lo que evita depender de `NULLS NOT DISTINCT` y hace difícil mezclar
idioma y variante. FK compuesta `course_settings(course_id, user_id)` →
`courses(id, owner_id)`: una fila de settings para quien no es el dueño del curso
no se puede insertar.

```text
pnpm db:reset   migración aplicada desde vacío (x3), sin pasos manuales
pnpm db:test    000 ok · 010 ok · 020 ok — All tests successful, 33 tests
pnpm db:types   database.types.ts regenerado (enums incluidos), mismo commit
pnpm check      exit 0
```

Funciones trigger sin `search_path` mutable y sin `SECURITY DEFINER` (gate §12.3).
Ejecutado también con el contenedor recién arrancado (`stop` → `start` → `reset`
→ `test`) y `pnpm e2e` 14/14 con las cuatro tablas creadas.

### LEX-1.14 — Verificar clon limpio y cerrar M1 — `HECHO`

Informe completo en [`evidence/LEX-1.14.md`](evidence/LEX-1.14.md).

Auditoría sobre un `git clone` recién sacado de GitHub (`C:\Temp\lex114`, commit
`451d668`), no sobre el árbol de trabajo: lo que se comprueba es que no haga falta
nada que solo exista en esta máquina.

Secuencia completa en verde desde el clon:

```text
pnpm install --frozen-lockfile   500 paquetes, lockfile coincide
pnpm db:start                     stack arriba, imprime URL y clave publishable
.env.local desde .env.example     plantilla correcta
pnpm db:reset                     Reset local database.  (0 migraciones aún)
pnpm db:test                      PASS  (Files=2, Tests=2)
pnpm check                        exit 0  (formato, lint, tipos, contraste 18/18, vitest 17/17, build)
pnpm e2e                          14 passed  (escritorio + Poco F5)
pnpm start                        / → 307 → /es · /es → 200 lang="es" · /api/health → 200 ok
```

**CI verde registrada:** run `33103009623` sobre `main` (`success`, 2 m 39 s,
commit `451d668`) y run `33170219084` sobre la rama de cierre (PR #3, `success`,
2 m 45 s). Runner Linux frío: es la prueba del camino desde cero real.

**Límite declarado:** la máquina local ya tenía imágenes de Docker, store de pnpm
y navegadores de Playwright en caché. El clon local prueba reproducibilidad en
una máquina ya preparada; el camino desde nada lo cubre la CI.

**Hallazgos de la auditoría, corregidos:** el README no tenía instrucciones de
instalación (añadida sección mínima; el README de portfolio sigue siendo
LEX-10.4) y afirmaba «Fase 0 de 10, sin aplicación ejecutable»; este `STATUS.md`
describía un estado anterior a FASE 1 y se ha reescrito; el roadmap privado tenía
la cabecera de FASE 1, la sección «siguiente tarea» y varios contadores
desactualizados. Detalle en el informe §5.

### FASE 1 — cerrada (14/14)

M1 completo. Cada tarea tiene su informe en [`evidence/`](evidence/):

| Tarea | Entregable |
|---|---|
| LEX-1.1 | Aplicación Next.js 16 + React 19 + TS estricto + pnpm |
| LEX-1.2 | Calidad base: scripts canónicos, TS endurecido, Prettier |
| LEX-1.3 | Estructura modular y regla de dependencia exigible por lint |
| LEX-1.4 | Validación de entorno con Zod, servidor/cliente separados |
| LEX-1.5 | Internacionalización ES/EN con `next-intl`, enrutado `/[locale]` |
| LEX-1.6 | Sistema visual base: tokens oklch, tres temas, contraste ejecutable |
| LEX-1.7 | Supabase local vía CLI del proyecto; cierra Q-003 |
| LEX-1.8 | Clientes Supabase SSR, ninguno privilegiado; `getSession()` prohibido |
| LEX-1.9 | Vitest + RTL; regresión automática de la regla de capas |
| LEX-1.10 | pgTAP y arnés de base de datos; invariante permanente de RLS |
| LEX-1.11 | Playwright: escritorio y Poco F5 real, contra build de producción |
| LEX-1.12 | CI en GitHub Actions, tres trabajos; cierra Q-004 |
| LEX-1.13 | Landing ES/EN y health check que no filtra; raíz de composición |
| LEX-1.14 | Clon limpio verificado; PR #3 con CI verde; M1 cerrado |

### FASE 0 — cerrada (8/8)

M0 completo: repositorio, documentación de gobierno, ADR-001…004, specs técnicas,
protocolo del agente, workflow, glosario y política de contenido. Auditoría en
[`evidence/LEX-0.8.md`](evidence/LEX-0.8.md). Etiqueta `v0.1.0-m0`.

### Frontera público / privado

| Contenido | Ubicación | ¿En Git? |
|---|---|---|
| Especificación maestra | `docs/no_visible_en_github/MASTER_SPEC.md` | **No** |
| Roadmap detallado | `docs/no_visible_en_github/ROADMAP.md` | **No** |
| Material privado de Anki | `docs/no_visible_en_github/` | **No** |
| Estado y preguntas abiertas | `docs/STATUS.md`, `docs/OPEN_QUESTIONS.md` | Sí |
| ADR y evidencia | `docs/adrs/`, `docs/evidence/` | Sí |
| Protocolo del agente | `CLAUDE.md` | Sí |
| Presentación del proyecto | `README.md` | Sí |

---

## Trabajo todavía abierto

**LEX-2.2** está `EN PROCESO`. Seed, tests y `DATA_MODEL.md` hechos y
committeados en la rama `feat/lex-2-2-language-seeds`; falta el cierre formal:
push, PR, CI verde, merge, y marcar `HECHO` en el roadmap y este archivo.

Después: **LEX-2.3** — políticas RLS por operación y tests de aislamiento dueño /
no-dueño (pgTAP) sobre las cuatro tablas de LEX-2.1; `languages` de solo lectura.

---

## Archivos y migraciones afectados en esta sesión

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260828143434_identity_and_course.sql` | Creado. `profiles`, `languages`, `courses`, `course_settings`; enums `ui_locale`, `cefr_level`; triggers de `updated_at` y de zona horaria IANA; RLS habilitado. |
| `supabase/tests/database/020-identity-course-schema.sql` | Creado. 31 asserciones pgTAP de estructura y CHECK. |
| `src/shared/infrastructure/supabase/database.types.ts` | Regenerado desde el esquema. |
| `docs/DATA_MODEL.md` | Añadido el esquema exacto de las cuatro tablas. |
| `docs/evidence/LEX-2.1.md` | Creado. |
| `supabase/seed.sql` | LEX-2.2: 3 filas de `languages` con UUID fijos, `on conflict do nothing`. |
| `supabase/tests/database/030-languages-seed.sql` | LEX-2.2: creado. Estado e idempotencia del seed. |
| `supabase/tests/database/020-…` | LEX-2.2: reescrito para no depender del seed. |
| `docs/DATA_MODEL.md` | LEX-2.1: esquema de las 4 tablas. LEX-2.2: notas del seed y del curso de referencia. |
| `docs/evidence/LEX-2.2.md` | Creado. |
| `docs/evidence/LEX-1.14.md`, `README.md` | LEX-1.14 (cerrada antes en esta sesión). |

Migraciones SQL: **1** (`20260828143434_identity_and_course`, LEX-2.1). LEX-2.2
no añade migración: el seed no es un cambio de esquema.

---

## Verificaciones ejecutadas y resultados

### Entorno de desarrollo

| Herramienta | Versión |
|---|---|
| Git | 2.39.0.windows.2 |
| Node.js | 24.19.0, gestionado con nvm-windows (`.nvmrc`) |
| pnpm | 11.24.0, vía corepack |
| Docker | Desktop 4.88.1, motor 29.7.2 |
| CLI de Supabase | 2.116.0, dependencia de desarrollo del proyecto |

### Puertas de calidad — 2026-08-28

```text
LEX-2.1 (merged):  pnpm check exit 0 · db:test 33 · e2e 14/14
LEX-2.2 (rama):     pnpm check exit 0 · e2e 14/14
  pnpm db:reset   migración + seed desde vacío; 3 filas en languages con UUID fijos
  pnpm db:test    000 · 010 · 020 · 030 — All tests successful, 38 asserciones
  pnpm db:types   sin cambios (el seed no toca el esquema)
```

### CI

```text
run 33182455688   CI   main            push          success   merge de PR #4 (LEX-2.1)
run 33182960329   CI   main            push          success   merge de PR #5 (LEX-2.1 docs)
```

Todas con los tres trabajos (Calidad, Base de datos, Extremo a extremo) en verde.
La CI de la rama de LEX-2.2 está pendiente.

---

## Verificaciones manuales pendientes

Corresponden a Joan:

1. **Confirmar la interpretación de «curso de referencia» en LEX-2.2:** se ha
   entregado como definición documentada, no como fila sembrada en `courses`
   (que necesitaría un usuario ficticio y adelantaría LEX-2.4). Ver
   `evidence/LEX-2.2.md` §1.
2. Mantener una copia de seguridad de `docs/no_visible_en_github/` fuera del
   proyecto: Git no protege esos archivos.

---

## Bloqueos y preguntas

| ID | Asunto | Estado |
|---|---|---|
| Q-001 | Visibilidad de `CLAUDE.md` | `RESUELTA` — público |
| Q-002 | Qué documentación es pública | `RESUELTA` — privado el diseño, público el método |
| Q-003 | Herramientas de desarrollo | `RESUELTA` |
| Q-004 | Primer push al remoto público | `RESUELTA` |

Ninguna abierta.

---

## Riesgos o deuda conocida

- **Al mover o renombrar una ruta, `pnpm typecheck` falla hasta borrar `.next`.**
  Los tipos generados describen el árbol anterior. Es caché, no un error del
  código; la CI no lo sufre porque parte de un árbol limpio.
- **ESLint corre sobre una línea sin soporte (9.39.5).** Bloqueante:
  `eslint-plugin-react` no soporta ESLint 10. Riesgo bajo —herramienta de
  desarrollo, no se despliega—. Revisar al actualizar Next.js o antes de LEX-9.9.
- **El repositorio es público desde el primer commit.** Cualquier archivo
  confirmado una vez queda permanentemente en el historial y en los forks.
  Comprobar `git status` antes de cada commit.
- **`MASTER_SPEC.md` y `ROADMAP.md` quedan fuera de Git:** sin historial, sin
  copia de seguridad y sin revisión por PR. Riesgo real de pérdida por borrado
  accidental.
- **En esta máquina, un Node 22 propio en `C:\Program Files\nodejs` tapa el shim
  de nvm-windows.** `nvm use` no basta en una terminal sin privilegios. No afecta
  al repositorio; anotado para no volver a tropezar.
- Sin `LICENSE`. Repositorio público sin licencia = todos los derechos reservados
  por defecto. Debe decidirse antes de la publicación de la V1 (LEX-10.10).

---

## Siguiente acción exacta

**Cerrar LEX-2.2.** `git push -u origin feat/lex-2-2-language-seeds`, abrir el PR
(ID en el título), esperar CI verde (los tres trabajos), fusionar a `main`.
Entonces marcar LEX-2.2 `HECHO` en el roadmap y actualizar este archivo.

Después: **LEX-2.3** — políticas RLS por operación y tests de aislamiento dueño /
no-dueño (pgTAP) sobre `profiles`, `languages`, `courses`, `course_settings`;
`languages` de solo lectura. Aplica el gate §12.3.

---

## Qué no debe aparecer en este documento

Este archivo es público y se actualiza en cada tarea. Nunca debe contener:

- títulos, descripciones o criterios de tareas futuras del roadmap privado;
- contenido copiado de `MASTER_SPEC.md`;
- URLs de proyecto, *project refs*, claves o cadenas de conexión de Supabase;
- correos, rutas locales de la máquina del propietario o identificadores personales;
- nombres o contenido de los mazos privados de Anki usados como material de prueba;
- salidas de comandos sin revisar, que puedan arrastrar cualquiera de los anteriores.

Referencias por ID (`LEX-n.m`, `Q-nnn`) sí: identifican sin revelar.

---

## Estado de git

- Rama por defecto: `main`, sincronizada con `origin/main`.
  Etiquetas `v0.1.0-m0` y `v0.2.0-m1` publicadas.
- LEX-1.14 → PR #3; LEX-2.1 → PR #4 (+ #5 docs). Ramas borradas.
- **Rama de trabajo actual:** `feat/lex-2-2-language-seeds`, a partir de `main`,
  con el seed de idiomas de LEX-2.2. Sin empujar.
- Contenido versionado: aplicación Next.js completa, `supabase/` (config, seed,
  tests, **migrations** — una: `20260828143434_identity_and_course`), CI,
  documentación en `docs/` y ADR.
