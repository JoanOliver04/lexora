# LEX-3.3 — Restricciones, índices y RLS de biblioteca

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-3-library-rls` (PR #27, merge `402da72`)
**Estado resultante:** `HECHO`

---

## 1. Alcance

Tercer paso de FASE 3 / M3. Sobre las seis tablas que LEX-3.2 dejó con RLS
*habilitado sin políticas* (deny-all): las políticas por dueño, los índices que
el predicado `owner_id` y la sugerencia de duplicados necesitan, y la unicidad
de `tags.normalized_name` por curso.

**Fuera de alcance, declarado:**

- **Índice de búsqueda por título** (`concepts`/`decks`) → LEX-3.9, que decide
  si compensa `pg_trgm` con la forma de consulta real. El criterio de salida de
  LEX-3.3 nombra «búsqueda»; se traslada explícitamente.
- **Repositorios y casos de uso** → LEX-3.4.
- **CRUD y pantallas** → LEX-3.5…3.11.

## 2. Migración `20260904122347_library_rls.sql`

### Políticas RLS

Cada tabla es de dueño para todas sus operaciones, por su `owner_id`
denormalizado — patrón idéntico a `course_settings` (LEX-2.3): un solo campo,
sin `join`, porque las FK compuestas de LEX-3.2 ya obligan a que `owner_id`
iguale al del curso/padre.

| Tabla | Políticas |
|---|---|
| `decks` | `SELECT` / `INSERT` / `UPDATE` / `DELETE` con `(select auth.uid()) = owner_id` |
| `concepts` | idem, las cuatro |
| `practice_items` | idem, las cuatro |
| `tags` | idem, las cuatro |
| `deck_concepts` | idem, las cuatro (`UPDATE` porque `position` es mutable) |
| `concept_tags` | `SELECT` / `INSERT` / `DELETE` — **sin `UPDATE`**: la fila es su PK más `owner_id`, no hay nada que modificar; re-etiquetar es borrar e insertar |

`(select auth.uid())` envuelto en subconsulta escalar → InitPlan, una
evaluación por sentencia. `force row level security` **no** se activa (igual que
LEX-2.3: `postgres` tiene BYPASSRLS y ningún cliente se conecta como
propietario).

### `010-rls-enabled.sql` no se amplía

Ampliar la invariante permanente a «RLS con ≥1 política» convertiría el patrón
de dos fases (habilitar RLS en la migración de esquema, políticas en la
siguiente) —que LEX-2.1 y LEX-3.2 usaron a propósito— en una suite roja para
las tablas de fase 4 y 5. La comprobación «≥1 política» vive en
`090-library-rls.sql`, acotada a las seis tablas de biblioteca. Deuda de
`evidence/LEX-2.3.md` §7; el motivo por el que siguió aplazada se mantiene.

### Índices

Además de los de FK que respaldó LEX-3.2 (`(course_id)` / `(concept_id)` /
`(tag_id)`):

- `(owner_id)` en las seis tablas — toda consulta filtra por él vía RLS, como
  `courses_owner_id_idx`.
- `concepts (owner_id, canonical_key)` — «mis conceptos cuya `canonical_key`
  coincide con esta» (sugerencia de duplicados, LEX-3.10). `owner_id` primero
  para que el índice sea usable bajo RLS.

### Unicidad

Índice único `tags (course_id, normalized_name)` — sin duplicados equivalentes
dentro de un curso (§13.10). `normalized_name` ya colapsa mayúsculas, espacios
y el espaciado de `::` (LEX-3.1 `normalizeTagName`), así que la igualdad sobre
él es equivalencia. El mismo nombre en dos cursos son dos etiquetas.

### Aceptado, no impuesto

`deck_concepts` y `concept_tags` garantizan **el mismo dueño**, no el mismo
curso. Un usuario puede enlazar en la base un concepto del curso A a un mazo del
curso B; lo evita la interfaz (LEX-3.5/3.6 solo ofrecen conceptos del mismo
curso). Imponerlo exigiría `course_id` en la tabla de enlace y una FK compuesta
a `(id, course_id)`; no compensa sobre una tabla recién creada cuando la
frontera de seguridad (cruce entre usuarios) ya es estructural. Registrado en
`DATA_MODEL.md` §Pendiente.

## 3. Pruebas

### `supabase/tests/database/090-library-rls.sql` — 48 asserciones nuevas

Autocontenido con idiomas `zz` y dos usuarios A/B (cada uno con curso, mazo, dos
conceptos, ítem, etiqueta y ambos enlaces); A tiene además un segundo curso para
probar el alcance de la unicidad de `tags`. Estilo de `040`: cada bloque de rol
fija `auth.uid()` primero y empareja cada denegación con su permiso.

| Bloque | Cubre |
|---|---|
| Juego de políticas | `bag_eq` por tabla — las cuatro de `decks`/`concepts`/`practice_items`/`tags`/`deck_concepts`, y `concept_tags` con tres y sin `UPDATE`. |
| «≥1 política» | `is_empty` de las seis tablas sin política (la comprobación que no va en `010`). |
| Bloque A | ve solo lo suyo (8 recuentos, incluido «no alcanza el concepto de B por UUID»); muta lo suyo (5 `lives_ok`); reutiliza el nombre de etiqueta en otro curso propio (`lives_ok`) pero no en el mismo (`23505`). |
| A contra B | `INSERT` de fila con `owner_id = B` → `42501` (WITH CHECK); `INSERT` en `deck_concepts` enlazando el concepto propio al mazo de B → `23503` (FK compuesta, salta RLS — prueba el **esquema**, no la política); `UPDATE`/`DELETE` sobre `decks`/`concepts`/`deck_concepts`/`concept_tags`/`practice_items` de B → **cero filas**, sin error. |
| Bloque B | tras los intentos de A: su mazo, título, concepto, `answer_text` y enlaces intactos; no ve nada de A. |
| Bloque anon | no ve ninguna de las seis tablas; no puede insertar (`42501`). |
| `service_role` | salta RLS y ve todo. |

### `080-library-schema.sql` — 67 → 69

La aserción que marcaba «`tags` todavía no impone unicidad» (`lives_ok`) pasa a
`throws_ok '23505'`. Se añaden las dos comprobaciones estructurales de los
índices de LEX-3.3 (`has_index` de `concepts_owner_canonical_key_idx`,
`index_is_unique` de `tags_course_normalized_name_key`) — estructura en el
fichero de estructura; su efecto funcional está en `090`.

### Verificación por rotura

`decks_select_own` debilitada a `using (true)` → `pnpm db:test`: fallan
**exactamente** las tres aserciones de visibilidad de `decks` en `090` («A ve
solo su mazo» → 2; «A no ve el mazo de B filtrando por `owner_id`» → 1; «B ve
solo su mazo» → 2) y aborta en el singleton `select title from public.decks`
que ahora devuelve dos filas. **Ningún fallo en `040`, `070` ni `080`**: el
debilitamiento de la política de `decks` solo toca aserciones de `decks`.
Restaurada; `db:test` vuelve a 240/240.

## 4. Puertas

```text
pnpm db:reset  6 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test   10 ficheros / 240 asserciones, PASS (090 nuevo: 48; 080: 67 → 69)
pnpm db:types  sin cambios (RLS e índices no alteran los tipos generados)
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 19/129, build)
pnpm e2e       sin cambios respecto a LEX-3.2 (LEX-3.3 no toca pantallas ni rutas)
```

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260904122347_library_rls.sql` | Nuevo. 23 políticas RLS, 7 índices, 1 índice único. |
| `supabase/tests/database/090-library-rls.sql` | Nuevo. 48 asserciones de aislamiento dueño / no-dueño / anon / service_role + juego de políticas exacto. |
| `supabase/tests/database/080-library-schema.sql` | La aserción de «unicidad todavía no impuesta» pasa a `throws_ok '23505'`; se añaden `has_index` + `index_is_unique` de los índices de LEX-3.3 (plan 67 → 69). |
| `docs/DATA_MODEL.md` | Bloque «RLS, índices y unicidad» de biblioteca; cabecera de estado y «Pendiente» al día. |
| `docs/evidence/LEX-3.3.md` | Este informe. |

## 6. Riesgos y deuda

- **`010-rls-enabled.sql` sigue comprobando «RLS habilitado», no «≥1 política».**
  La comprobación acotada está en `090`. Una tabla nueva de fase 4/5 que
  habilite RLS y olvide las políticas la cazaría solo si su propio test la
  incluye. Convertir `010` en una lista-permitida que cada tarea actualiza sigue
  siendo una opción para más adelante.
- **`deck_concepts` / `concept_tags` garantizan mismo dueño, no mismo curso**
  (§2, aceptado).
- **Índice de búsqueda por título** pendiente para LEX-3.9.
- Deuda arrastrada: revisión cruzada independiente §3.6 (aquí, las políticas RLS
  de biblioteca). Sin segundo agente.

## 7. Estado del árbol Git

Rama `feat/lex-3-3-library-rls` desde `main` (`87930f4`), un commit
(`2b3a6ca`). PR #27 fusionada a `main` (merge `402da72`); CI verde en los tres
trabajos, runs `33864116248` (PR; el job E2E tardó ~10 min —la espera de
`supabase start` con reintento absorbió un `toomanyrequests` de Docker Hub del
runner— pero pasó) y `33864928285` (merge). Rama borrada.

## 8. Siguiente tarea

**LEX-3.4** — repositorios y casos de uso de la biblioteca: puertos y adaptadores
Supabase para `decks` / `concepts` / `practice_items` / `tags`, validación en el
borde con Zod (§13.9), sin lógica de negocio fuera del dominio. Depende de
LEX-3.3. No se inicia aquí.
