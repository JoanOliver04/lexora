# LEX-2.2 — Seeds de idiomas y curso de referencia

**Fecha:** 2026-08-28
**Rama:** `feat/lex-2-2-language-seeds` — PR [#6](https://github.com/JoanOliver04/lexora/pull/6)
**Estado resultante:** `HECHO`

---

## 1. Alcance y una interpretación declarada

**Seed del catálogo de idiomas** en `supabase/seed.sql`: tres filas para el par
inicial, deterministas e idempotentes.

**«Curso de referencia»:** `MASTER_SPEC.md` no define un curso plantilla, y
`courses.owner_id` es `NOT NULL`; el curso real lo crea el onboarding por
usuario (LEX-2.7), y la creación del perfil la decide LEX-2.4. Sembrar una fila
en `courses` obligaría a inventar un usuario en `auth.users` y adelantaría esas
dos tareas. Por eso el «curso de referencia» se entrega como **definición
documentada** (en `DATA_MODEL.md` y en un comentario del seed), no como fila:
`source` = `es`/`es`, `target` = `en`/`en`, `target_locale` = `en-GB`,
`start_level` recomendado `A1`, `daily_new_limit` 5.

Si Joan quería una fila sembrada de verdad, es un añadido pequeño; se marca aquí
para que sea una decisión visible y no un supuesto.

## 2. El seed

```sql
insert into public.languages (id, code, locale, name_key, active) values
  ('5eeda001-0000-4000-8000-000000000001', 'es', 'es',    'language.es',    true),
  ('5eeda001-0000-4000-8000-000000000002', 'en', 'en',    'language.en',    true),
  ('5eeda001-0000-4000-8000-000000000003', 'en', 'en-GB', 'language.en_gb', true)
on conflict (code, locale) do nothing;
```

- **Determinista:** UUID literales, no `gen_random_uuid()`. Dos ejecuciones
  dejan exactamente la misma base.
- **Idempotente:** `on conflict do nothing`. Re-ejecutar el seed no cambia nada.
  Un `do update` habría reescrito `name_key`/`updated_at` en cada `db:reset` y no
  sería idempotente en el sentido observable. Si un `name_key` tuviera que
  cambiar, es una migración, no una reescritura del seed.
- **Cuatro conceptos de idioma separados:** el idioma de **interfaz** es
  `profiles.ui_locale` (un enum), no una fila de esta tabla. El seed cubre el
  idioma de apoyo (`es`), el estudiado (`en`) y su variante (`en-GB`).
- Solo local y CI. Preview y producción no aplican `seed.sql` (MASTER_SPEC
  §15.3, §21.1).

## 3. Tests

### `030-languages-seed.sql` (nuevo)

```text
pnpm db:test
  000-setup.sql ................... ok
  010-rls-enabled.sql ............. ok
  020-identity-course-schema.sql .. ok
  030-languages-seed.sql .......... ok
  All tests successful.   Files=4, Tests=38
```

Cinco asserciones: exactamente 3 filas; los pares `(code, locale)` son `es/es`,
`en/en`, `en/en-GB`; `en-GB` conserva su UUID fijo; re-ejecutar los `insert` del
seed dentro de la transacción no añade filas; las tres quedan `active`.

**Lo que `030` sí prueba y lo que no:** prueba que la cláusula `on conflict do
nothing` funciona. **No** prueba que `db:reset` sea idempotente —`db:reset` borra
la base antes de sembrar, así que no hay conflicto que resolver—.

### `020-identity-course-schema.sql` (reescrito: independiente del seed)

El seed ahora ocupa `es`/`es` y `en`/`en-GB`, que `020` usaba como valores
válidos de prueba. En vez de acoplarlo al seed, `020` crea sus propios idiomas
sintéticos `zz` (código reservado a uso privado en ISO 639, nunca colisiona).

Tras la reescritura se verificó que **cada `throws_like` sigue fallando por la
razón que dice su descripción**, ejecutando el `insert` a mano:

```text
[base_or_variant]  ERROR: ... viola check constraint "languages_locale_base_or_variant"
[unique]           ERROR: ... viola unique constraint "languages_code_locale_unique"
[source=target]    ERROR: ... viola check constraint "courses_source_target_distinct"
[blank title]      ERROR: ... viola check constraint "courses_title_length"
[curso válido]     INSERT 0 1
```

## 4. Verificación

```text
pnpm db:reset   migración + seed desde vacío; 3 filas en languages con sus UUID fijos
pnpm db:test    4 ficheros, 38 asserciones, PASS
pnpm db:types   sin cambios (el seed no toca el esquema); git diff vacío
pnpm check      exit 0
pnpm e2e        14 passed
```

(Un `db:reset` falló con `LegacyDbSetupError: error running container: exit 1` y
funcionó al reintentar: incidencia ya registrada en LEX-1.7.)

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `supabase/seed.sql` | 3 filas de `languages` con UUID fijos y `on conflict do nothing`; comentario con la definición del curso de referencia. |
| `supabase/tests/database/030-languages-seed.sql` | Creado. 5 asserciones sobre el estado y la idempotencia del seed. |
| `supabase/tests/database/020-identity-course-schema.sql` | Reescrito para no depender del seed (idiomas sintéticos `zz`). |
| `docs/DATA_MODEL.md` | Notas de semillas y del curso de referencia. |
| `docs/evidence/LEX-2.2.md` | Creado. |

Migraciones añadidas: **ninguna** (el seed no es una migración de esquema).

## 6. Riesgos y deuda

- El seed inserta datos que también ve la CI (`db:reset` en el job de base de
  datos). Es intencionado y coherente con MASTER_SPEC §21.2.
- «Curso de referencia» como documentación y no como fila: decisión declarada en
  §1; revisar con Joan si esperaba otra cosa.

## 7. Estado del árbol Git

Fusionada a `main` vía PR #6. CI verde sobre la rama (run `33188502934`) y sobre
`main` tras el merge (run `33188727474`), los tres trabajos. Rama borrada.

## 8. Siguiente tarea

**LEX-2.3** — políticas RLS por operación y tests de aislamiento dueño /
no-dueño (pgTAP) sobre `profiles`, `languages`, `courses`, `course_settings`.
`languages` con política de solo lectura. No se inicia aquí.
