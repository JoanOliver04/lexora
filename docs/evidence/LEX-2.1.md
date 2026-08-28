# LEX-2.1 — Migración de `profiles`, `languages`, `courses`, `course_settings`

**Fecha:** 2026-08-28
**Rama:** `feat/lex-2-1-identity-course-schema` — PR [#4](https://github.com/JoanOliver04/lexora/pull/4)
**Estado resultante:** `HECHO`

---

## 1. Alcance

Primera migración con tablas. Define **estructura**: columnas, claves, CHECK,
enums, timestamps y el guardián de zona horaria. Habilita RLS en las cuatro
tablas (deniega todo hasta que haya políticas).

**Fuera de esta tarea, a propósito:** las políticas RLS explícitas por operación
y los tests de aislamiento dueño / no-dueño son **LEX-2.3**. El mecanismo de
creación del perfil (trigger sobre `auth.users` frente a caso de uso) es
**LEX-2.4**. Las semillas de `languages` y el curso de referencia son **LEX-2.2**.

## 2. Decisiones de diseño

### `locale` en `languages` es NOT NULL

Un idioma base guarda `locale = code` (`es`/`es`); una variante guarda
`en`/`en-GB`. Así `(code, locale)` es una clave única simple, sin depender de
`NULLS NOT DISTINCT`, y un CHECK (`locale = code OR locale LIKE code || '-%'`)
hace estructuralmente difícil colar una variante bajo el idioma equivocado —el
error que `DATA_MODEL.md` llama «la vía rápida a un modelo que no admite un
segundo par de idiomas»—.

### FK compuesta en `course_settings`

`user_id` está denormalizado (siempre igual a `courses.owner_id`) porque
simplifica las políticas de LEX-2.3 a una comprobación de una columna. Para que
esa igualdad no sea solo una convención, `courses` lleva `UNIQUE (id, owner_id)`
y `course_settings` tiene `FOREIGN KEY (course_id, user_id) REFERENCES courses
(id, owner_id)`. Una fila de settings para alguien que no es el dueño del curso
**no se puede insertar**.

### Zona horaria: trigger, no CHECK

`pg_timezone_names` es una función que devuelve conjuntos sobre la base de datos
de zonas del sistema operativo, no una tabla, así que no cabe en un CHECK; un
envoltorio marcado `IMMUTABLE` mentiría, porque esa base de datos cambia. Un
trigger `BEFORE INSERT OR UPDATE OF timezone` es el sitio honesto. El coste de
escanearla es irrelevante: una fila por usuario.

### Enums para estados cerrados

`ui_locale` (`es`, `en`) y `cefr_level` (`A1`–`B2`), siguiendo `DATA_MODEL.md`
(«enums de PostgreSQL para estados cerrados»).

### Funciones sin `search_path` mutable

`set_updated_at()` y `profiles_assert_iana_timezone()` no son `SECURITY
DEFINER`, fijan `search_path = ''` y cualifican cada referencia con su esquema.
Es lo que pide el gate §12.3 y lo que marcaría el advisor de Supabase.

## 3. Por qué habilitar RLS aquí ya importa

Comprobado contra el stack local: en este proyecto `anon`, `authenticated` y
`service_role` reciben DML completo sobre cualquier tabla nueva de `public` por
defecto.

```text
grantee       | privilege_type
--------------+---------------
anon          | INSERT, SELECT, UPDATE, DELETE, ...
authenticated | INSERT, SELECT, UPDATE, DELETE, ...
service_role  | INSERT, SELECT, UPDATE, DELETE, ...
```

RLS es la única barrera (lo que ya afirmaba la evidencia de LEX-1.8). Una tabla
creada sin `enable row level security` sería legible y escribible por cualquiera.
Estado tras la migración:

```text
     relname     | rls_enabled | rls_forced | políticas
-----------------+-------------+------------+----------
 profiles        | t           | f          | 0
 languages       | t           | f          | 0
 courses         | t           | f          | 0
 course_settings | t           | f          | 0
```

`rls_forced` queda en `f`: forzar RLS también sobre el rol propietario es una
decisión de LEX-2.3, cuando existan políticas y semillas que no deban quedar
bloqueadas. Cero políticas = denegar todo, que es el estado seguro provisional.

## 4. Verificación

### Migración desde una base limpia

```text
pnpm db:stop && pnpm db:start && pnpm db:reset
  Applying migration 20260828143434_identity_and_course.sql...
  Finished supabase db reset
```

Reaplicada varias veces desde cero, incluida una pasada con el contenedor
recién arrancado (`stop` → `start` → `reset`), sin pasos manuales. Tras ella,
los únicos objetos en `public` son los que crea la migración: las 4 tablas, los
2 enums y las 2 funciones trigger. (Un primer `reset` falló con
`LegacyDbSetupError: error running container: exit 1` y funcionó al reintentar
sin cambiar nada: contenedores asentándose, incidencia ya registrada en
LEX-1.7.)

### pgTAP — `020-identity-course-schema.sql`

```text
pnpm db:test
  000-setup.sql ................... ok
  010-rls-enabled.sql ............. ok
  020-identity-course-schema.sql .. ok
  All tests successful.   Files=3, Tests=33
```

31 asserciones en `020`: las cuatro tablas y sus PK, las tres FK que sostienen
el aislamiento (incluida la compuesta), RLS habilitado, los dos enums, y **cada
CHECK probado rechazando un valor inválido además de aceptar uno válido**:

- zona horaria: acepta `Europe/Madrid`, rechaza `Mars/Olympus` (`23514`);
- `languages`: acepta `en`/`en-GB` y `es`/`es`, rechaza `en`/`fr-FR` y el
  `(code, locale)` duplicado;
- `courses`: rechaza origen = destino y título en blanco;
- `course_settings`: rechaza `daily_new_limit` = 101, `requested_retention` =
  0.50, una fila cuyo `user_id` no es el dueño (`23503`, FK compuesta) y una
  segunda fila para el mismo curso (`23505`).

### Tipos y puertas de calidad

```text
pnpm db:types      regenera database.types.ts (enums ui_locale y cefr_level incluidos)
pnpm check         exit 0  — format, lint, typecheck, contraste, vitest 17/17, build
pnpm e2e           14 passed — la landing y /api/health siguen bien con las 4 tablas creadas
```

`database.types.ts` se regenera en este mismo commit; la CI comprueba que
corresponde al esquema. `pnpm e2e` se ejecuta aquí porque la migración toca la
base con la que habla la app: `/api/health` la consulta, y LEX-1.13 exige que su
respuesta no filtre detalles internos.

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260828143434_identity_and_course.sql` | Creado. Las cuatro tablas, dos enums, dos funciones trigger. |
| `supabase/tests/database/020-identity-course-schema.sql` | Creado. 31 asserciones pgTAP de estructura y CHECK. |
| `src/shared/infrastructure/supabase/database.types.ts` | Regenerado desde el esquema. |
| `docs/DATA_MODEL.md` | Añadido el esquema exacto de las cuatro tablas y los enums. |

Migraciones añadidas: **1**.

## 6. Riesgos y deuda

- **RLS sin políticas** dispara el advisor informativo de Supabase
  `rls_enabled_no_policy` en las cuatro tablas. Es el estado esperado; LEX-2.3 lo
  cierra.
- Sin índices en `courses.source_language_id` / `target_language_id`: el catálogo
  es diminuto y `DATA_MODEL.md` pide medir antes de indexar. Revisar si aparece
  una consulta que los use.
- **`courses.target_locale` y `languages.locale` (vía `target_language_id`) pueden
  divergir:** nada obliga a que coincidan. Es deliberado: `target_locale` es una
  *preferencia* del curso, no un espejo de la fila de `languages`. Si más
  adelante debe ser un espejo, se añade una restricción; hoy no la hay.
- `scheduler_config_version` es `integer` por defecto 1; la fase 5 (LEX-5.3,
  LEX-5.13) puede necesitar otro formato de versión.
- Comentarios del `.sql` de la migración en inglés (WORKFLOW §2, «comentarios de
  código»); el fichero pgTAP nuevo sigue en español para casar con
  `000-setup.sql` y `010-rls-enabled.sql`, que ya estaban así.

## 7. Estado del árbol Git

Fusionada a `main` vía PR #4. CI verde sobre la rama (run `33182207944`) y sobre
`main` tras el merge (run `33182455688`), los tres trabajos. Rama borrada.

## 8. Siguiente tarea

**LEX-2.2** — semillas de `languages` (`es`, `en`, `en-GB`) y curso de
referencia, idempotentes y sin datos personales. No se inicia aquí.
