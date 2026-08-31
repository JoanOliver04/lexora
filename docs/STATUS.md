# Lexora — Estado actual

**Última actualización:** 2026-08-31
**Fase actual:** FASE 2 — Identidad, onboarding y curso — `EN PROCESO` (3/11)
**Hito actual:** M2 — Identidad y onboarding aislados — `PENDIENTE`. M1 `HECHO`
**Tarea activa:** ninguna
**Estado de la tarea:** LEX-2.1 · LEX-2.2 · LEX-2.3 `HECHO` · siguiente LEX-2.4
**Rama / commit base / HEAD:** `main` con LEX-2.3 fusionado (PR #8, merge `ec9223d`)

> El roadmap detallado y la especificación maestra son documentos privados y
> locales; no forman parte de este repositorio público. Ver
> [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) Q-002.

---

## Terminado en esta sesión

### LEX-2.3 — RLS y tests de aislamiento de las tablas base — `HECHO`

Informe completo en [`evidence/LEX-2.3.md`](evidence/LEX-2.3.md).

Migración `20260831162304_identity_and_course_rls.sql`: 14 políticas RLS por
operación sobre las cuatro tablas que LEX-2.1 dejó con RLS habilitado y sin
políticas (deny-all).

- **`profiles`:** `SELECT`/`INSERT`/`UPDATE` para `authenticated` con
  `auth.uid() = id`. **Sin `DELETE`** a propósito: el ciclo de vida del perfil
  va por la cascada de `auth.users`; el borrado de cuenta es FASE 8. (STATUS
  anterior decía «SELECT/INSERT/UPDATE/DELETE»; el matiz queda aquí y en el
  informe: `courses` y `course_settings` sí tienen las cuatro.)
- **`courses`:** las cuatro operaciones con `auth.uid() = owner_id`.
- **`course_settings`:** las cuatro con `auth.uid() = user_id` (una columna: la
  FK compuesta ya ata `user_id` al dueño del curso).
- **`languages`:** solo lectura, `SELECT using (true)` para `anon` y
  `authenticated`. `using (true)` y no `using (active)` porque `courses`
  referencia esta tabla por FK. Sin políticas de escritura.
- `(select auth.uid())` envuelto para que se evalúe como InitPlan.
- **`force row level security` NO activado:** ningún cliente se conecta como
  propietario de la tabla (LEX-1.8) y `postgres` tiene `BYPASSRLS` (comprobado).
  Decisión técnica declarada en el comentario de la migración, no un `Q-nnn`.

Test `040-identity-course-rls.sql` (nuevo), autocontenido con idiomas `zz` y dos
usuarios: `set local role` + `request.jwt.claims`, 36 asserciones. Cada bloque
fija `auth.uid()` antes de nada y empareja cada denegación con su permiso, para
que un JWT que no llegara a `auth.uid()` no dé un falso verde. Cubre A/B/anon/
service_role, acceso directo y por UUID conocido del curso ajeno.

```text
pnpm db:reset   2 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test    5 ficheros, 74 asserciones, PASS
pnpm db:types   sin cambios; git diff de database.types.ts vacío
pnpm check      exit 0
pnpm e2e        14 passed
```

**Verificación por rotura:** debilitar `courses_select_own`/`courses_delete_own`
a `using (true)` → fallan exactamente las 5 asserciones de aislamiento de
`courses` (incluida una que detecta el borrado real del curso de B), ninguna
otra. Restaurado → PASS.

### LEX-2.2 — Seeds de idiomas y curso de referencia — `HECHO`

Informe completo en [`evidence/LEX-2.2.md`](evidence/LEX-2.2.md). PR #6, CI verde.

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
  `throws_like` re-verificado fallando por su constraint. `030` comprueba las 3
  filas por su UUID fijo, no el total de la tabla.

```text
pnpm db:reset   migración + seed desde vacío; 3 filas con sus UUID fijos
pnpm db:test    4 ficheros, 38 asserciones, PASS
pnpm db:types   sin cambios (el seed no toca el esquema)
pnpm check      exit 0
pnpm e2e        14 passed
```

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

Ninguna tarea `EN PROCESO`. FASE 2 en 3/11. LEX-2.3 fusionada a `main` (PR #8).

Siguiente: **LEX-2.4** — creación idempotente de perfil ligada a `auth.users`:
reintento seguro, perfil no duplicable, comportamiento de error probado, y
decisión trigger / caso de uso documentada. Depende de LEX-2.1 y LEX-2.3.

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
| `docs/DATA_MODEL.md` | LEX-2.1: esquema de las 4 tablas. LEX-2.2: notas del seed y del curso de referencia. LEX-2.3: cabecera de estado y sección RLS reescritas con el conjunto de políticas real. |
| `docs/evidence/LEX-2.2.md` | Creado. |
| `docs/evidence/LEX-1.14.md`, `README.md` | LEX-1.14 (cerrada antes en esta sesión). |
| `supabase/migrations/20260831162304_identity_and_course_rls.sql` | LEX-2.3: creado. 14 políticas RLS por operación. |
| `supabase/tests/database/040-identity-course-rls.sql` | LEX-2.3: creado. 36 asserciones de aislamiento dueño / no-dueño / anon / service_role. |
| `docs/evidence/LEX-2.3.md` | Creado. |

Migraciones SQL: **2** (`20260828143434_identity_and_course`, LEX-2.1;
`20260831162304_identity_and_course_rls`, LEX-2.3). LEX-2.2 no añade migración.

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

### Puertas de calidad — LEX-2.3 (2026-08-31, rama `feat/lex-2-3-rls-policies`)

```text
pnpm db:reset   2 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test    000 · 010 · 020 · 030 · 040 — All tests successful, 74 asserciones
pnpm db:types   sin cambios; git diff de database.types.ts vacío
pnpm check      exit 0 (format, lint, typecheck, contraste, vitest, build)
pnpm e2e        14 passed (escritorio-chromium + movil-poco-f5)
```

Verificación por rotura: debilitar `courses_select_own`/`courses_delete_own` a
`using (true)` → fallan exactamente 5 asserciones de aislamiento de `courses`,
ninguna otra; restaurado → PASS.

### CI

```text
run 33422803840   CI   main                        push           success   merge de PR #8 (LEX-2.3)
run 33416229043   CI   feat/lex-2-3-rls-policies    pull_request   success   PR #8 (LEX-2.3)
run 33188727474   CI   main                        push           success   merge de PR #6 (LEX-2.2)
```

LEX-2.3: PR [#8](https://github.com/JoanOliver04/lexora/pull/8) fusionada a
`main` (merge `ec9223d`); CI verde tras el merge (run 33422803840, tres
trabajos: Calidad 45s · Base de datos 2m13s · Extremo a extremo 2m19s).

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
- **La invariante de `010-rls-enabled.sql` comprueba «RLS habilitado», no «RLS
  con ≥1 política».** Una tabla de FASE 3 podría habilitar RLS y olvidar las
  políticas: quedaría en deny-all silencioso. Ampliar la invariante es trabajo de
  FASE 3 (ver `evidence/LEX-2.3.md` §7).
- **LEX-2.3 sin revisión cruzada independiente** (§3.6, políticas RLS). No hay
  segundo agente disponible. Deuda visible.

---

## Siguiente acción exacta

Empezar **LEX-2.4** — creación idempotente de perfil ligada a `auth.users`:
alta con reintento seguro, perfil no duplicable, comportamiento de error
probado; documentar la decisión trigger vs. caso de uso. Depende de LEX-2.1 y
LEX-2.3, ambas `HECHO` y en `main`.

`force row level security`: decidido **no** activarlo (razón en
`evidence/LEX-2.3.md` §2 y en el comentario de la migración).

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

- Rama por defecto: `main`, sincronizada con `origin/main` (`ec9223d`).
  Etiquetas `v0.1.0-m0` y `v0.2.0-m1` publicadas.
- LEX-1.14 → PR #3; LEX-2.1 → PR #4 (+ #5 docs); LEX-2.2 → PR #6 (+ #7 docs);
  LEX-2.3 → PR #8 (+ este cierre docs). Ramas borradas.
- Contenido versionado: aplicación Next.js completa, `supabase/` (config, seed,
  tests, **migrations** — dos: `20260828143434_identity_and_course`,
  `20260831162304_identity_and_course_rls`), CI, documentación en `docs/` y ADR.
