# LEX-3.2 — Migraciones de la biblioteca

**Fecha:** 2026-09-02
**Rama:** `feat/lex-3-2-library-schema` (PR #25, merge `886e15a`)
**Estado resultante:** `HECHO`

---

## 1. Alcance

Segundo paso de FASE 3 / M3: las **seis tablas** del módulo `library`
—`decks`, `concepts`, `deck_concepts`, `practice_items`, `tags`,
`concept_tags`—, estructura y restricciones de integridad. Refleja el dominio
puro de LEX-3.1.

**Fuera de alcance, declarado:**

- **Políticas RLS y tests de aislamiento dueño / no-dueño** → LEX-3.3. Las seis
  tablas quedan con RLS *habilitado* y sin políticas (deny-all).
- **Índices de consulta** (propietario, curso, búsqueda, `canonical_key`,
  unicidad de `tags.normalized_name` por curso) → LEX-3.3. Aquí solo los que
  respaldan una FK cuyo lado padre no cubre ya una PK.
- **Repositorios y casos de uso** → LEX-3.4.
- **CRUD y pantallas** → LEX-3.5…3.11.

## 2. Migración `20260902193649_library_schema.sql`

### Enums

| Enum | Valores |
|---|---|
| `deck_category` | `vocabulary`, `grammar`, `communicative_function`, `pronunciation`, `professional`, `mixed` |
| `concept_kind` | `vocabulary`, `collocation`, `phrase`, `grammar`, `communicative_function`, `pronunciation`, `other` |
| `practice_mode` | los **siete** de §13.9: `basic_recognition`, `basic_recall`, `cloze`, `listening_dictation`, `guided_production`, `free_production`, `pronunciation` |

`cefr_level` se reutiliza de LEX-2.1. El límite a los tres modos activables en
la V1 lo aplica `validatePracticeItemDraft` (LEX-3.1), **no** un CHECK: un CHECK
habría que quitarlo en FASE 6 cuando entren los otros modos.

### Q-005 — se entrega con la recomendación

§9.5 ofrece «profesional» como nivel y como categoría; §13.6 nombra la columna
`cefr_level` (solo bandas MCER). Esta migración sigue la recomendación
registrada en `docs/OPEN_QUESTIONS.md`: `professional` es un valor de
`deck_category` y `decks.cefr_level` reutiliza `public.cefr_level` (nullable).
**Q-005 sigue `ABIERTA`.** Si Joan decide lo contrario, cambian `deck_category`
y esta migración (y `taxonomy.ts`).

### Pertenencia estructural (patrón de `course_settings`, LEX-2.1)

`owner_id` denormalizado en las seis tablas. FK compuesta
`(x_id, owner_id) → padre (id, owner_id)`:

| Tabla | FK compuesta |
|---|---|
| `decks` | `(course_id, owner_id) → courses (id, owner_id)` `on delete cascade` |
| `concepts` | `(course_id, owner_id) → courses (id, owner_id)` `on delete cascade` |
| `deck_concepts` | `(deck_id, owner_id) → decks (id, owner_id)` **y** `(concept_id, owner_id) → concepts (id, owner_id)`, ambas cascade |
| `practice_items` | `(concept_id, owner_id) → concepts (id, owner_id)` cascade |
| `tags` | `(course_id, owner_id) → courses (id, owner_id)` cascade |
| `concept_tags` | `(concept_id, owner_id) → concepts (id, owner_id)` **y** `(tag_id, owner_id) → tags (id, owner_id)`, ambas cascade |

En `deck_concepts` y `concept_tags` la **misma** columna `owner_id` participa en
las dos FK compuestas: mazo y concepto (o concepto y etiqueta) tienen que ser
del mismo usuario o la fila no se inserta. Sin FK suelta `owner_id → profiles`,
por el mismo motivo que `course_settings` no la tiene: la compuesta ya obliga a
que `owner_id` sea un perfil real de forma transitiva, y el borrado de un perfil
llega a estas filas por la cascada de `courses`. `decks (id, owner_id)`,
`concepts (id, owner_id)` y `tags (id, owner_id)` son UNIQUE para poder ser
destino de esas FK compuestas.

### `concepts.canonical_key` — columna generada

`text generated always as (lower(btrim(regexp_replace(title, '\s+', ' ', 'g')))) stored`.
Reproduce `canonicalKey` del dominio (`normalizeWhitespace` + minúsculas):
colapsa cualquier tanda de espacios a uno, recorta, minúsculas. **No quita
acentos** (idioma de apoyo español; §13.7 prohíbe fusión automática). No puede
separarse del título ni recibir un valor a mano (`428C9`). **Sin índice único:**
solo sugiere duplicados, no los fusiona; cuánto se afloja la coincidencia es
LEX-3.10.

### JSONB — solo donde §13 lo justifica

- `practice_items.config` — discriminado por `mode`. **Sin valor por defecto**
  (un `'{}'` fallaría siempre el CHECK). CHECK `jsonb_typeof(config) = 'object'`
  y CHECK `config ? 'mode' and config->>'mode' = mode::text`. Un `{}` se rechaza
  porque le falta la clave `mode` (`config ? 'mode'` es falso). Un `config` cuyo
  `mode` no cuadra con la columna `mode` se rechaza.
- `concepts.metadata` — extensión acotada (§13.7), por defecto `'{}'`, CHECK
  `jsonb_typeof = 'object'`.

### Longitudes, archivado, triggers

- CHECK de longitud **≥** los límites de `library/domain/taxonomy.ts`
  (`TITLE` 200, `SHORT` 500, `LONG` 4000): `decks.title` 1–200,
  `decks.description` ≤ 500, `concepts.title` 1–200, `concepts.summary` 1–500,
  `concepts.explanation` ≤ 4000, `concepts.example` ≤ 500,
  `concepts.source_reference` ≤ 500, `practice_items.prompt_text` 1–4000,
  `practice_items.answer_text` 1–500, `practice_items.hint_text` ≤ 500,
  `tags.normalized_name` 1–200, `tags.display_name` 1–200.
- `tags.normalized_name` CHECK `!~ '(^|::)(::|$)'` — sin segmento vacío
  (`a::`, `::b`, `a::::b`, `::`). Coincide con `tag.name.emptySegment` del
  dominio.
- `decks.position` / `deck_concepts.position` CHECK ≥ 0 (`deck_concepts` nullable).
- `archived_at timestamptz` en `decks`, `concepts`, `practice_items`. No hay
  borrado físico previsto para esas filas salvo la cascada al borrar el curso.
- Trigger `set_updated_at` (función compartida de LEX-2.1) en las cinco tablas
  con `updated_at`. `concept_tags` no tiene `updated_at` ni trigger: no hay
  carga mutable.

### Índices

Solo respaldo de FK cuyo lado padre no cubre ya una PK: `decks(course_id)`,
`concepts(course_id)`, `tags(course_id)`, `deck_concepts(concept_id)`,
`concept_tags(tag_id)`, `practice_items(concept_id)`. Los de
propietario/curso/búsqueda/`canonical_key` y la unicidad de
`tags.normalized_name` por curso son LEX-3.3.

## 3. Pruebas — `supabase/tests/database/080-library-schema.sql`

**67 asserciones nuevas.** `pnpm db:test` → **9 ficheros / 190 asserciones,
PASS** (123 previas + 67).

| Bloque | Cubre |
|---|---|
| Estructura | las 6 tablas + PK; `col_is_pk` de las dos PK compuestas; `has_type` de los 3 enums nuevos; `enum_has_labels` de `practice_mode` (7) y `deck_category` (incluye `professional`). |
| FK compuestas | `fk_ok` de las 8 FK compuestas. |
| RLS | `bool_and(relrowsecurity)` sobre las 6. |
| Triggers | `trigger_is` de los 5 `set_updated_at` (nombre de trigger, tabla y función) — sin esto un `create trigger` mal escrito pasaría el resto. |
| `canonical_key` | `'  Casa   Verde '` → `'casa verde'`; `'Águila Real'` → `'águila real'` (acentos intactos); insertar un valor explícito → `428C9`. |
| CHECK | cada guardián rechaza un valor: título/resumen/enunciado en blanco, textos demasiado largos, `metadata`/`config` que no son objeto, `config` vacío (`{}`), `config.mode` que no cuadra, `kind` fuera del enum, `position` negativa, segmento de etiqueta vacío ×3, `normalized_name` demasiado largo. Un `config` que cuadra → `lives_ok`. |
| `deck_concepts` | par único (`23505`); no enlaza mi mazo con el concepto de otro (`23503`); `update position` corre (dispara el trigger). |
| `practice_items` | no cuelga de un concepto de otro usuario (`23503`). |
| `concept_tags` | no etiqueta el concepto de otro usuario (`23503`). |
| `tags` | dos `normalized_name` equivalentes en el mismo curso **se aceptan hoy** — marca la ausencia deliberada; LEX-3.3 lo sustituirá por un `throws`. |
| Cascada | borrar el curso no falla con biblioteca colgando; `decks`, `concepts`, `deck_concepts` (dos saltos) y `practice_items` (dos saltos) quedan vacíos por identidad. |

### Verificación por rotura

- `plan(52)` inicial → `plan(60)` tras contar; luego `plan(67)` con los 5
  `trigger_is`, el `update position` y el segundo `is_empty` de la cascada
  (revisión: el chequeo de huérfanos original —`where not exists (…)`— no podía
  fallar).
- Test 49 falló dos veces antes de acertar el guardián: `normalized_name = ''`
  dispara primero `tags_display_name_length` (si `display_name` también vacío) y
  luego `tags_no_empty_segment` (cadena vacía = segmento vacío). Se cambió a
  `repeat('x', 201)` para ejercer `tags_normalized_name_length` de verdad.

## 4. Puertas

```text
pnpm db:reset  5 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test   9 ficheros / 190 asserciones, PASS (080 nuevo: 67)
pnpm db:types  database.types.ts regenerado en el mismo commit; git diff limpio al re-ejecutar
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 19 ficheros/129, build)
pnpm e2e       sin cambios respecto a LEX-3.1 (LEX-3.2 no toca pantallas ni rutas)
```

CI verde en los tres trabajos: run `33663842254` (PR #25) y run `33664239771`
(merge a `main`).

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260902193649_library_schema.sql` | Nuevo. 3 enums, 6 tablas, FK compuestas, columna generada, CHECK, triggers, índices de FK, RLS habilitado sin políticas. |
| `supabase/tests/database/080-library-schema.sql` | Nuevo. 67 asserciones pgTAP de estructura, CHECK, FK compuesta, cascada y triggers. |
| `src/shared/infrastructure/supabase/database.types.ts` | Regenerado desde el esquema (mismo commit). |
| `docs/DATA_MODEL.md` | Bloque «Esquema exacto» de las seis tablas de biblioteca; «Pendiente» y cabecera de estado al día. |
| `docs/evidence/LEX-3.2.md` | Este informe. |

## 6. Riesgos y deuda

- **`Q-005` abierta.** La migración fija `deck_category` con `professional` y
  `decks.cefr_level = public.cefr_level`. Si Joan decide que «profesional» es un
  nivel, cambian el enum, la migración y `taxonomy.ts`.
- **`canonical_key` aparece como `canonical_key?: string | null` en el `Insert`
  de `database.types.ts`.** Es una limitación de `supabase gen types` con
  columnas generadas. Un repositorio de LEX-3.4 que extienda un `Concept` del
  dominio dentro de un `insert` compilaría y fallaría en ejecución con `428C9`.
  `DATA_MODEL.md` lo anota («No admite valor explícito»); LEX-3.4 debe construir
  el `insert` sin `canonical_key`.
- **`concepts.source_reference`**: la base lo acota a 500; el dominio (LEX-3.1)
  todavía no lo valida. Un valor largo daría un error de base en vez de un
  mensaje del dominio hasta que LEX-3.6 lo cubra.
- **Regla «mismo curso, no solo mismo dueño» en `deck_concepts`.** Hoy solo se
  garantiza el mismo `owner_id`; un usuario podría enlazar un concepto del
  curso A a un mazo del curso B. Candidata a LEX-3.3.
- **`010-rls-enabled.sql` comprueba «RLS habilitado», no «≥1 política».** Las
  seis tablas nuevas entran en deny-all hasta LEX-3.3; ampliar la invariante
  sigue pendiente (deuda de `evidence/LEX-2.3.md` §7).
- Deuda arrastrada: revisión cruzada independiente §3.6 (aquí, el esquema de
  biblioteca). Sin segundo agente.

## 7. Estado del árbol Git

Rama `feat/lex-3-2-library-schema` desde `main` (`ec8a33c`), un commit
(`294653e`). PR #25 fusionada a `main` (merge `886e15a`); CI verde en los tres
trabajos, runs `33663842254` (PR) y `33664239771` (merge). Rama borrada.

## 8. Siguiente tarea

**LEX-3.3** — restricciones, índices y RLS de la biblioteca: políticas por
propietario sobre las seis tablas con caso dueño y no-dueño, índices de
propietario/curso/búsqueda/`canonical_key`, unicidad de `tags.normalized_name`
por curso, y —si procede— la regla «mismo curso» de `deck_concepts`. Depende de
LEX-3.2. No se inicia aquí.
