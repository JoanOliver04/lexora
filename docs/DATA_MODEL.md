# Modelo de datos

Entidades de Lexora, cómo se relacionan y qué convenciones sigue el esquema.
Las decisiones que lo condicionan están en
[ADR-002](adrs/ADR-002-supabase-sin-orm.md) y
[ADR-003](adrs/ADR-003-fsrs-programa-practice-item.md).

> **Estado:** existen las cuatro tablas de identidad y curso (`profiles`,
> `languages`, `courses`, `course_settings`), con sus políticas RLS
> (migraciones `20260828143434_identity_and_course` y
> `20260831162304_identity_and_course_rls`), y las seis tablas de biblioteca
> (`decks`, `concepts`, `deck_concepts`, `practice_items`, `tags`,
> `concept_tags`) con estructura (migración `20260902193649_library_schema`,
> LEX-3.2), políticas RLS por dueño, índices de `owner_id` y unicidad de
> `tags.normalized_name` por curso (`20260904122347_library_rls`, LEX-3.3). El
> resto del modelo descrito aquí es lo acordado; las columnas exactas,
> restricciones, índices y políticas se fijan en las migraciones SQL de cada
> fase, que son la fuente de verdad del esquema.

## La distinción que lo explica todo

```text
Concept          «achievement» — la unidad de conocimiento
   │
   ├── PracticeItem A   achievement → logro          (reconocimiento)
   ├── PracticeItem B   logro → achievement          (recuperación)
   ├── PracticeItem C   audio → achievement          (dictado, futuro)
   └── PracticeItem D   escribe una frase con…       (producción, futuro)
                              │
                              └── LearningState      un estado por usuario e ítem
```

Un concepto agrupa; **no** acumula progreso. El estado de memoria pertenece a la
pareja *(usuario, `PracticeItem`)*, porque reconocer una palabra y ser capaz de
producirla son capacidades distintas que se olvidan a ritmos distintos.

Una variación superficial del enunciado no crea un calendario nuevo: dos frases
con hueco que miden la misma recuperación son variantes de presentación del mismo
`PracticeItem`.

## Diagrama

```mermaid
erDiagram
    profiles      ||--o{ courses          : posee
    languages     ||--o{ courses          : origen_o_destino
    courses       ||--|| course_settings  : configura
    courses       ||--o{ decks            : contiene
    courses       ||--o{ concepts         : contiene
    decks         ||--o{ deck_concepts    : agrupa
    concepts      ||--o{ deck_concepts    : pertenece_a
    concepts      ||--o{ practice_items   : se_practica_como
    concepts      ||--o{ concept_tags     : etiquetado
    tags          ||--o{ concept_tags     : etiqueta
    practice_items ||--o{ learning_states : programa
    practice_items ||--o{ review_logs     : registra
    profiles      ||--o{ learning_states  : memoriza
    profiles      ||--o{ review_logs      : revisa
    study_sessions ||--o{ review_logs     : agrupa
    import_jobs   ||--o{ import_job_errors : detalla
```

## Entidades

### Identidad y configuración

| Tabla | Papel |
|---|---|
| `profiles` | Extensión uno a uno de la tabla de usuarios de autenticación: nombre, idioma de interfaz, zona horaria, fin del onboarding. |
| `languages` | Catálogo de referencia. Permite representar un idioma y su variante regional sin mezclarlos con el idioma de la interfaz. |
| `courses` | Relaciona un idioma de origen con uno de destino y configura la experiencia de estudio. |
| `course_settings` | Preferencias por curso: límite diario de elementos nuevos, límite de repasos, versión de configuración del planificador. |

Cuatro conceptos de idioma se mantienen separados a propósito: idioma de la
interfaz, idioma de apoyo, idioma estudiado y variante regional del contenido.
Mezclarlos es la vía rápida a un modelo que no admite un segundo par de idiomas.

#### Esquema exacto (migración `20260828143434_identity_and_course`, LEX-2.1)

Estados cerrados como enums de PostgreSQL: `ui_locale` (`es`, `en`) y
`cefr_level` (`A1`, `A2`, `B1`, `B2`).

**`profiles`** — extensión uno a uno de `auth.users`.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `= auth.users(id)`, `on delete cascade` |
| `display_name` | `text` NULL | CHECK: nulo, o 1–80 caracteres tras recortar |
| `ui_locale` | `ui_locale` NOT NULL | por defecto `es` |
| `timezone` | `text` NOT NULL | por defecto `Europe/Madrid`; un trigger `BEFORE` exige que sea un nombre real de `pg_timezone_names` |
| `onboarding_completed_at` | `timestamptz` NULL | lo fija el onboarding (LEX-2.7/2.8) |
| `active_course_id` | `uuid` NULL | curso que la interfaz prioriza (LEX-2.9). NULL = usar el más antiguo. |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | `updated_at` lo mantiene un trigger |

_Curso activo (migración `20260831215553_active_course`, LEX-2.9):_
`active_course_id` lleva una **FK compuesta** `(active_course_id, id) →
courses (id, owner_id)` con `on delete set null (active_course_id)`. La
columna `id` en la FK ata el curso activo al propio usuario igual que
`course_settings(course_id, user_id)` ata la configuración al dueño: un
`update` que apunte al curso de otro falla con `23503`, no «devuelve vacío al
leer». **La lista de columnas en `set null` es obligatoria**: sin ella,
`on delete set null` pondría a NULL también `id` —la PK— y el borrado del
curso fallaría (sintaxis de PostgreSQL 15+). Lo fija el onboarding
(`complete_onboarding`, vía `coalesce`) y, más adelante, un selector. Las
políticas RLS de `profiles` (LEX-2.3) ya cubren la columna; no hay política
nueva. Aislamiento probado en `supabase/tests/database/070-active-course.sql`.

_Creación de la fila (LEX-2.4):_ la asegura un **caso de uso de la capa de
aplicación** (`ensureProfile`) a la entrada del área autenticada, bajo la
identidad del propio usuario, de forma idempotente
(`INSERT ... ON CONFLICT (id) DO NOTHING`). **No hay trigger** sobre
`auth.users` y LEX-2.4 no añade migración: la unicidad la da la PK y el
aislamiento la política `profiles_insert_own`. Motivos en
[ADR-005](adrs/ADR-005-creacion-de-perfil.md).

**`languages`** — catálogo de referencia. Semillas en LEX-2.2.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `code` | `text` NOT NULL | ISO base, CHECK `^[a-z]{2,3}$` |
| `locale` | `text` NOT NULL | etiqueta completa: un idioma base guarda `locale = code` (`es`/`es`); una variante guarda `en`/`en-GB`. CHECK: `locale = code` **o** `locale LIKE code || '-%'` |
| `name_key` | `text` NOT NULL | clave de traducción de interfaz, no vacía |
| `active` | `boolean` NOT NULL | por defecto `true` |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |
| | | UNIQUE `(code, locale)` |

`locale` es NOT NULL a propósito: mantiene `(code, locale)` como clave única
simple y hace estructuralmente difícil confundir «idioma» y «variante regional».

_Semillas (LEX-2.2, `supabase/seed.sql`):_ tres filas con UUID fijos —
`es`/`es`, `en`/`en`, `en`/`en-GB` — insertadas con `on conflict (code, locale)
do nothing`. El seed solo se aplica en local y en CI, nunca en preview ni
producción. El idioma de **interfaz** no vive aquí: es `profiles.ui_locale`.

**`courses`** — un par origen→destino de un solo dueño.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `owner_id` | `uuid` NOT NULL | → `profiles(id)` `on delete cascade`; índice |
| `title` | `text` NOT NULL | CHECK 1–120 caracteres tras recortar |
| `source_language_id` | `uuid` NOT NULL | → `languages(id)` |
| `target_language_id` | `uuid` NOT NULL | → `languages(id)`; CHECK distinto de `source` |
| `target_locale` | `text` NOT NULL | por defecto `en-GB` |
| `declared_level` | `cefr_level` NULL | nivel académico declarado; no bloquea contenido |
| `start_level` | `cefr_level` NULL | nivel por el que se empieza dentro de la app |
| `active` | `boolean` NOT NULL | por defecto `true` |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |
| | | UNIQUE `(id, owner_id)` — destino de la FK compuesta de `course_settings` |

_Curso de referencia (LEX-2.2):_ no hay fila sembrada en `courses` — un curso
tiene `owner_id NOT NULL` y lo crea el onboarding por usuario (LEX-2.7). El
«curso de referencia» es esta definición, fuente única para onboarding y demo:
`source` = fila `es`/`es`, `target` = fila `en`/`en`, `target_locale` = `en-GB`,
`start_level` recomendado `A1`, `daily_new_limit` 5.

**`course_settings`** — una fila por curso.

| Columna | Tipo | Notas |
|---|---|---|
| `course_id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL | denormalizado; **siempre** `= courses.owner_id` |
| `daily_new_limit` | `integer` NOT NULL | por defecto 5; CHECK 0–100 |
| `maximum_reviews_per_day` | `integer` NULL | NULL = sin límite; CHECK 0–2000 |
| `requested_retention` | `numeric(3,2)` NULL | CHECK 0.70–0.97 (rango de FSRS) |
| `show_interval_preview` | `boolean` NOT NULL | por defecto `true` |
| `scheduler_config_version` | `integer` NOT NULL | por defecto 1; lo refina la fase 5 |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |
| | | FK compuesta `(course_id, user_id)` → `courses(id, owner_id)` `on delete cascade` |

La FK compuesta convierte «`user_id` es el dueño del curso» en una garantía
estructural: no se puede insertar una fila de settings para otro usuario.

**RLS (migración `20260831162304_identity_and_course_rls`, LEX-2.3):**

| Tabla | Política |
|---|---|
| `profiles` | `SELECT`/`INSERT`/`UPDATE` para `authenticated` con `auth.uid() = id`. **Sin `DELETE`:** el ciclo de vida del perfil va por la cascada de `auth.users`; el borrado de cuenta es FASE 8. |
| `courses` | `SELECT`/`INSERT`/`UPDATE`/`DELETE` para `authenticated` con `auth.uid() = owner_id`. |
| `course_settings` | `SELECT`/`INSERT`/`UPDATE`/`DELETE` para `authenticated` con `auth.uid() = user_id` (una columna basta: la FK compuesta ya ata `user_id` al dueño del curso). |
| `languages` | Solo lectura: `SELECT` `using (true)` para `anon` y `authenticated`. Sin políticas de escritura (solo `postgres` siembra). `using (true)` y no `using (active)` porque `courses` referencia esta tabla por FK. |

`auth.uid()` se envuelve en subconsulta escalar (`(select auth.uid())`) para que
PostgreSQL lo evalúe una vez por sentencia. `force row level security` **no** se
activa: ningún cliente se conecta como propietario de la tabla (LEX-1.8). Tests
de aislamiento dueño / no-dueño / anon / service_role en
`supabase/tests/database/040-identity-course-rls.sql`.

**Funciones (migración `20260831204649_onboarding_rpc`, LEX-2.7):**

| Función | Papel |
|---|---|
| `public.complete_onboarding(ui_locale, cefr_level, cefr_level, integer) → uuid` | Operación atómica e idempotente del onboarding (ADR-002: las operaciones complejas van en una función SQL probada). Resuelve el par de idiomas del catálogo por `(code, locale)`; busca el curso más antiguo del `owner_id` y lo actualiza (`active = true`), o inserta uno con `title` en el idioma de interfaz; upsert de `course_settings`; fija `profiles.ui_locale`, `onboarding_completed_at` (una sola vez) y `active_course_id` (vía `coalesce`, LEX-2.9). Devuelve el id del curso. |

`complete_onboarding` es **SECURITY INVOKER** con `search_path` fijado: corre
bajo la identidad de quien llama, así que cada escritura pasa las políticas RLS
de arriba; no puede tocar filas de otro usuario. `p_daily_new_limit` fuera de
`0..100` lo rechaza el CHECK de `course_settings`. Permisos: `revoke execute …
from public, anon` + `grant … to authenticated` — Supabase concede EXECUTE
sobre toda función nueva de `public` a `anon`/`authenticated`/`service_role` por
privilegios por defecto, de modo que `revoke from public` a secas dejaría a
`anon` pudiendo ejecutarla. Cobertura: `supabase/tests/database/060-onboarding-rpc.sql`
(dueño, no-dueño, anon, idempotencia con valores distintos).

### Biblioteca

| Tabla | Papel |
|---|---|
| `decks` | Agrupación organizativa por nivel, tema o finalidad. No posee el progreso: solo selecciona qué estudiar. |
| `concepts` | La unidad de conocimiento: palabra, expresión, regla, función comunicativa o contraste de pronunciación. |
| `deck_concepts` | Relación muchos a muchos. Permite que un concepto esté en varios mazos **sin duplicar su progreso**. |
| `practice_items` | Una competencia programable sobre un concepto, con su modo y su contenido. |
| `tags`, `concept_tags` | Etiquetas del usuario, con soporte para las jerarquías que llegan en la importación. |

`concepts` guarda una clave normalizada que sirve para **sugerir** duplicados.
No se usa para fusionarlos automáticamente: dos entradas idénticas pueden tener
matices distintos, y una fusión destructiva no se puede deshacer.

#### Esquema exacto (migración `20260902193649_library_schema`, LEX-3.2)

Estados cerrados como enums de PostgreSQL: `deck_category` (`vocabulary`,
`grammar`, `communicative_function`, `pronunciation`, `professional`, `mixed`),
`concept_kind` (`vocabulary`, `collocation`, `phrase`, `grammar`,
`communicative_function`, `pronunciation`, `other`) y `practice_mode` (los
**siete** modos de §13.9; solo `basic_recognition`, `basic_recall` y `cloze` se
activan en la V1, y ese límite lo aplica el dominio, no un CHECK). `cefr_level`
se reutiliza de LEX-2.1. Los tres enums nuevos reflejan
`src/modules/library/domain/taxonomy.ts`.

**Patrón común.** Igual que `course_settings` en LEX-2.1: `owner_id` está
denormalizado en las seis tablas y una **FK compuesta**
`(x_id, owner_id) → padre (id, owner_id)` convierte la pertenencia en
estructura. No se puede insertar una fila que enlace contenido de dos usuarios.
No hay FK suelta `owner_id → profiles`, por el mismo motivo que
`course_settings` no la tiene: la compuesta ya obliga a que `owner_id` sea un
perfil real de forma transitiva, y el borrado de un perfil llega a estas filas
por la cascada de `courses`. Longitudes de texto **≥** los límites del dominio
(`TITLE` 200, `SHORT` 500, `LONG` 4000). `archived_at timestamptz` en el
contenido con historial (`decks`, `concepts`, `practice_items`); no hay borrado
físico previsto para esas filas salvo la cascada al borrar el curso. Trigger
`set_updated_at` en las cinco tablas con `updated_at` (todas menos
`concept_tags`, que no tiene carga mutable).

**`decks`** — agrupación organizativa dentro de un curso.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `course_id` | `uuid` NOT NULL | parte de la FK compuesta a `courses` |
| `owner_id` | `uuid` NOT NULL | parte de la FK compuesta; **siempre** `= courses.owner_id` |
| `title` | `text` NOT NULL | CHECK 1–200 caracteres tras recortar |
| `description` | `text` NULL | CHECK: nulo o ≤ 500 |
| `cefr_level` | `cefr_level` NULL | Q-005: el nivel MCER del mazo; `professional` va en `category`, no aquí |
| `category` | `deck_category` NULL | |
| `position` | `integer` NOT NULL | por defecto 0; CHECK ≥ 0 |
| `archived_at` | `timestamptz` NULL | |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |
| | | FK compuesta `(course_id, owner_id)` → `courses(id, owner_id)` `on delete cascade`; UNIQUE `(id, owner_id)` — destino de la FK compuesta de `deck_concepts`; índice en `(course_id)` para respaldar la cascada |

**`concepts`** — unidad de conocimiento dentro de un curso.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `course_id`, `owner_id` | `uuid` NOT NULL | FK compuesta a `courses`, como en `decks` |
| `kind` | `concept_kind` NOT NULL | |
| `title` | `text` NOT NULL | CHECK 1–200 tras recortar |
| `canonical_key` | `text` GENERATED ALWAYS … STORED | `lower(btrim(regexp_replace(title, '\s+', ' ', 'g')))` — coincide con `canonicalKey` del dominio (minúsculas + colapso de espacios, **sin quitar acentos**). No admite valor explícito. **Sin índice único**: solo sugiere duplicados (§13.7), no los fusiona |
| `summary` | `text` NOT NULL | CHECK 1–500 tras recortar |
| `explanation` | `text` NULL | CHECK: nulo o ≤ 4000 |
| `example` | `text` NULL | CHECK: nulo o ≤ 500 |
| `cefr_level` | `cefr_level` NULL | |
| `source_reference` | `text` NULL | CHECK: nulo o ≤ 500. El dominio (LEX-3.1) todavía no acota este campo; lo acota la base |
| `metadata` | `jsonb` NOT NULL | por defecto `'{}'`; CHECK `jsonb_typeof = 'object'`. JSONB permitido aquí por §13.7 (extensión acotada y validada) |
| `archived_at` | `timestamptz` NULL | |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |
| | | FK compuesta `(course_id, owner_id)` → `courses(id, owner_id)` `on delete cascade`; UNIQUE `(id, owner_id)`; índice en `(course_id)` |

**`deck_concepts`** — relación muchos a muchos entre mazos y conceptos.

| Columna | Tipo | Notas |
|---|---|---|
| `deck_id`, `concept_id` | `uuid` NOT NULL | PK compuesta `(deck_id, concept_id)`: un concepto en un mazo, una sola vez |
| `owner_id` | `uuid` NOT NULL | **la misma columna** en las dos FK compuestas → mazo y concepto son del mismo usuario |
| `position` | `integer` NULL | orden dentro del mazo (opcional, §13.8); CHECK: nulo o ≥ 0 |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |
| | | FK compuestas `(deck_id, owner_id)` → `decks(id, owner_id)` y `(concept_id, owner_id)` → `concepts(id, owner_id)`, ambas `on delete cascade`; índice en `(concept_id)` (la PK ya cubre el lado `deck_id`) |

**`practice_items`** — competencia programable sobre un concepto.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `concept_id`, `owner_id` | `uuid` NOT NULL | FK compuesta a `concepts` |
| `mode` | `practice_mode` NOT NULL | |
| `prompt_text` | `text` NOT NULL | CHECK 1–4000 tras recortar |
| `answer_text` | `text` NOT NULL | CHECK 1–500 tras recortar |
| `hint_text` | `text` NULL | CHECK: nulo o ≤ 500 |
| `config` | `jsonb` NOT NULL | **sin valor por defecto**; CHECK `jsonb_typeof = 'object'` y CHECK `config ? 'mode' and config->>'mode' = mode::text` — un `{}` se rechaza. JSONB discriminado por `mode` (§13.9) |
| `enabled` | `boolean` NOT NULL | por defecto `true` |
| `archived_at` | `timestamptz` NULL | |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |
| | | FK compuesta `(concept_id, owner_id)` → `concepts(id, owner_id)` `on delete cascade`; índice en `(concept_id)` |

**`tags`** — etiqueta del usuario dentro de un curso.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `course_id`, `owner_id` | `uuid` NOT NULL | FK compuesta a `courses` |
| `normalized_name` | `text` NOT NULL | CHECK 1–200; CHECK `!~ '(^|::)(::|$)'` — sin segmento vacío (`a::`, `::b`, `a::::b`) |
| `display_name` | `text` NOT NULL | CHECK 1–200 tras recortar |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |
| | | FK compuesta `(course_id, owner_id)` → `courses(id, owner_id)` `on delete cascade`; UNIQUE `(id, owner_id)`; índice en `(course_id)`. **La unicidad de `normalized_name` por curso es LEX-3.3** |

**`concept_tags`** — relación muchos a muchos entre conceptos y etiquetas.

| Columna | Tipo | Notas |
|---|---|---|
| `concept_id`, `tag_id` | `uuid` NOT NULL | PK compuesta `(concept_id, tag_id)` |
| `owner_id` | `uuid` NOT NULL | la misma columna en las dos FK compuestas → concepto y etiqueta del mismo usuario |
| `created_at` | `timestamptz` NOT NULL | sin `updated_at`: no hay carga mutable |
| | | FK compuestas `(concept_id, owner_id)` → `concepts(id, owner_id)` y `(tag_id, owner_id)` → `tags(id, owner_id)`, ambas `on delete cascade`; índice en `(tag_id)` |

Estructura probada en `supabase/tests/database/080-library-schema.sql`
(67 aserciones: tablas, claves, enums, `trigger_is` de los cinco
`set_updated_at`, `canonical_key` generada, cada CHECK rechazando un valor, las
FK compuestas impidiendo enlaces entre usuarios y la cascada al borrar el
curso).

#### RLS, índices y unicidad (migración `20260904122347_library_rls`, LEX-3.3)

**RLS.** Cada una de las seis tablas es de dueño para todas sus operaciones,
por su `owner_id` denormalizado: política `SELECT`/`INSERT`/`UPDATE`/`DELETE`
con `(select auth.uid()) = owner_id`. `concept_tags` no lleva `UPDATE` (la fila
es su PK más `owner_id`, no hay nada que modificar; re-etiquetar es borrar e
insertar). Un solo campo basta: las FK compuestas de LEX-3.2 ya obligan a que
`owner_id` sea el del curso/padre, así que el acceso indirecto por la relación
también queda cerrado. `(select auth.uid())` envuelto para que se evalúe como
InitPlan. **`force row level security` no** se activa, igual que en LEX-2.3.

`010-rls-enabled.sql` **no** se amplía a «RLS con ≥1 política»: eso rompería el
patrón de dos fases (habilitar RLS en la migración de esquema, políticas en la
siguiente) para las tablas de fase 4 y 5. La comprobación «≥1 política» vive en
`090-library-rls.sql`, acotada a las seis tablas de biblioteca.

**Índices** (además de los de FK de LEX-3.2): `(owner_id)` en las seis tablas
—toda consulta filtra por él vía RLS—, como `courses_owner_id_idx`; y
`concepts (owner_id, canonical_key)` para la sugerencia de duplicados
(LEX-3.10). El índice de **búsqueda por título** espera a LEX-3.9, que decidirá
si compensa `pg_trgm` con la forma de consulta real.

**Unicidad:** índice único `tags (course_id, normalized_name)` — sin duplicados
equivalentes dentro de un curso (§13.10). `normalized_name` ya colapsa
mayúsculas, espacios y el espaciado de `::`, así que la igualdad sobre él es
equivalencia. El mismo nombre en dos cursos son dos etiquetas.

**Aceptado, no impuesto:** `deck_concepts` y `concept_tags` garantizan **el
mismo dueño**, no el mismo curso. Enlazar un concepto del curso A a un mazo del
curso B (del mismo usuario) es posible en la base; lo evita la interfaz
(LEX-3.5/3.6 solo ofrecen conceptos del mismo curso). Imponerlo exigiría
`course_id` en la tabla de enlace y una FK compuesta a `(id, course_id)`; no
compensa sobre una tabla recién creada mientras la frontera de seguridad
(cruce entre usuarios) ya es estructural.

Aislamiento probado en `supabase/tests/database/090-library-rls.sql`
(50 aserciones: juego de políticas exacto por tabla, «≥1 política», A ve solo lo
suyo y no alcanza lo de B ni por UUID conocido, `INSERT` como otro → `42501`,
`UPDATE`/`DELETE` sobre filas ajenas → cero filas, enlazar a un padre ajeno →
`23503` de la FK compuesta, unicidad de `tags` por curso → `23505`, anon no ve
ni escribe nada, `service_role` salta RLS).

#### Archivado y borrado controlado (LEX-3.8)

Cada tabla de biblioteca sigue una de dos políticas, decidida por tabla desde
LEX-3.2/3.4 y probada aquí como invariante, no solo enunciada:

| Se archiva (`archived_at`, sin `DELETE`) | Se borra de verdad (sin historial) |
|---|---|
| `decks`, `concepts`, `practice_items` | `tags`, `deck_concepts`, `concept_tags` |

**Archivar es un `UPDATE`, nunca un borrado ni un desenlace.** Poner
`archived_at = now()` en un mazo, un concepto o un ítem no toca ninguna otra
fila: los enlaces (`deck_concepts`, `concept_tags`) y las filas hijas
(`practice_items` de un concepto) siguen existiendo exactamente igual que
antes. **Restaurar** (`archived_at = null`) no necesita recrear nada, porque
nunca se destruyó nada.

**Sin cascada entre entidades archivables.** Cada tabla es dueña de su propio
`archived_at`; archivar una no archiva a las que cuelgan de ella:

- Archivar un **mazo** no archiva sus conceptos.
- Archivar un **concepto** no archiva el mazo que lo contiene ni sus
  `practice_items`.

Esto **sí tiene un efecto de visibilidad**, ya decidido en LEX-3.4: las
lecturas que embeben una relación (`listDeckConcepts`) excluyen los
**conceptos** archivados, así que un mazo puede parecer haber perdido
conceptos sin que el vínculo `deck_concepts` se haya roto — el enlace sigue en
la base, solo se filtra al leer. Es el mismo patrón que «archivar un mazo lo
saca de la lista por defecto»: visibilidad, no destrucción.

**Q-006 (abierta):** si algún día conviene que archivar un concepto archive
también en cascada sus ítems de práctica, es una decisión de producto
pendiente — la opción actual (sin cascada) es la recomendada para la V1 y la
que está construida; ver `OPEN_QUESTIONS.md`.

**Contraste con lo que sí se borra de verdad:** `tags` no tiene `archived_at`
— renombrar es un `UPDATE` normal, pero quitar una etiqueta es un `DELETE`
físico, y su FK a `concept_tags` **sí** lleva `on delete cascade` (LEX-3.2):
borrar una etiqueta borra sus enlaces `concept_tags`, al contrario que
archivar una entidad. `deck_concepts` y `concept_tags` como tablas de enlace
tampoco tienen `archived_at`: su ciclo de vida es el de sus dos extremos,
salvo que se borren explícitamente (`removeConceptFromDeck` /
`untagConcept`).

Probado en `supabase/tests/database/100-archive-invariants.sql`
(26 aserciones): estructura (quién tiene `archived_at` y quién no), archivar/
restaurar un mazo sin tocar su concepto ni el enlace, archivar/restaurar un
concepto sin tocar el mazo, sus enlaces ni sus ítems, archivar un ítem sin
tocar su concepto ni el ítem hermano, idempotencia de archivar/restaurar dos
veces seguidas, y el contraste de borrar una etiqueta sí cascada su enlace.

### Estudio

| Tabla | Papel |
|---|---|
| `learning_states` | Una fila por usuario e ítem de práctica: vencimiento, estabilidad, dificultad, repeticiones, lapsos, estado y última revisión. Incluye un contador de versión para control de concurrencia. |
| `study_sessions` | Agrupa repasos para poder resumirlos. No persiste la cola completa. |
| `review_logs` | Registro **append-only** de cada repaso: valoración, momento, y una instantánea del estado antes y después. |

`review_logs` es la pieza que permite auditar, reconstruir estados y migrar entre
versiones del algoritmo. El usuario no edita estas filas.

*Matiz importante:* «append-only» describe el funcionamiento normal, no impide
cumplir una solicitud de eliminación de cuenta. Borrar los datos propios sigue
siendo un derecho del usuario.

### Importación

| Tabla | Papel |
|---|---|
| `import_jobs` | Un trabajo de importación: destino, mapeo de columnas, estado y contadores. |
| `import_job_errors` | Errores por fila, con mensaje seguro y una muestra acotada y saneada. |

El archivo completo no se conserva indefinidamente.

### Tablas futuras

`media_assets`, `exercise_variants`, `user_responses`, `ai_feedback` y
`error_events` se crearán cuando se implementen las versiones que las necesiten.
No se crean tablas vacías por anticipación.

## Convenciones

| Convención | Regla |
|---|---|
| Identificadores | UUID. |
| Fechas y horas | Siempre en UTC. La conversión a día local usa la zona horaria del perfil, nunca la del navegador. |
| Restricciones | `NOT NULL`, `CHECK`, claves foráneas e índices explícitos y justificados. |
| Borrado | Archivado o borrado controlado para todo lo que tenga historial. Cascada solo cuando es segura y deliberada. |
| Estados cerrados | Enumeraciones de PostgreSQL o restricciones equivalentes. |
| JSON | Solo para configuraciones discriminadas, instantáneas históricas y extensiones. Nunca como sustituto de una columna que se consulta. |
| Seguridad | RLS habilitado en toda tabla expuesta, con políticas explícitas por propietario. |
| Índices | Sobre propietarios, claves foráneas, fecha de vencimiento, estados y filtros habituales. |

## Cuándo aparece cada tabla

| Fase | Tablas |
|---|---|
| 2 | `profiles`, `languages`, `courses`, `course_settings` — creadas en LEX-2.1 |
| 3 | `decks`, `concepts`, `deck_concepts`, `practice_items`, `tags`, `concept_tags` |
| 4 | `import_jobs`, `import_job_errors` |
| 5 | `learning_states`, `study_sessions`, `review_logs` |

## Pendiente

- Columnas exactas, tipos y restricciones de las tablas de fase 4 y 5: se fijan
  en su migración. Identidad (LEX-2.1…2.9) y biblioteca (LEX-3.2, LEX-3.3) ya
  están arriba.
- Índice de **búsqueda por título** de `concepts`/`decks`: LEX-3.9, cuando la
  consulta real decida si compensa `pg_trgm`.
- Regla «un mazo y sus conceptos son del mismo curso, no solo del mismo dueño»
  en `deck_concepts` / `concept_tags`: **aceptada como no impuesta** en LEX-3.3
  (la interfaz la respeta; imponerla exige `course_id` en la tabla de enlace).
- Estrategia de retención de registros históricos y de anonimización al eliminar una cuenta.
- El diagrama de arriba ya nombra las tablas de fase 4 y 5; se confirmará contra
  el esquema real cuando se creen esas migraciones.
