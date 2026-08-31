# LEX-2.3 — RLS y tests de aislamiento de las tablas base

**Fecha:** 2026-08-31
**Rama:** `feat/lex-2-3-rls-policies`
**Estado resultante:** `HECHO`

---

## 1. Alcance

LEX-2.1 habilitó RLS en `profiles`, `languages`, `courses` y `course_settings`
sin ninguna política: hoy las cuatro tablas deniegan todo a `anon` y
`authenticated`. LEX-2.3 añade las políticas explícitas por operación y las
prueba funcionalmente con un caso de dueño y otro de no-dueño.

- Migración nueva: `20260831162304_identity_and_course_rls.sql`.
- Test nuevo: `supabase/tests/database/040-identity-course-rls.sql`.
- Sin cambios de esquema: `database.types.ts` no varía.

## 2. Políticas

Todas las tablas de usuario: `to authenticated`, condición sobre el propietario
con `(select auth.uid())` envuelto en subconsulta escalar (PostgreSQL lo cachea
como InitPlan y lo evalúa una vez por sentencia, no una por fila).

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | `auth.uid() = id` | `auth.uid() = id` | `auth.uid() = id` | **ninguna** (denegado) |
| `courses` | `auth.uid() = owner_id` | `auth.uid() = owner_id` | `auth.uid() = owner_id` | `auth.uid() = owner_id` |
| `course_settings` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `languages` | `using (true)` para `anon, authenticated` | ninguna | ninguna | ninguna |

### Decisiones

- **`profiles` sin política `DELETE`.** El ciclo de vida del perfil está atado a
  `auth.users` (`id references auth.users (id) on delete cascade`). El borrado de
  cuenta es FASE 8; cuando llegue, elimina la fila de `auth.users` y la cascada
  se lleva el perfil. Un `delete from public.profiles` directo por el usuario no
  es una operación soportada y queda denegado por defecto. `STATUS.md` decía
  «`SELECT`/`INSERT`/`UPDATE`/`DELETE` por `auth.uid()` propietario»; se ha
  matizado allí y aquí: `courses` y `course_settings` sí tienen las cuatro;
  `profiles` tiene tres a propósito.

- **`languages` con `using (true)`, no `using (active)`.**
  `courses.source_language_id` / `target_language_id` son claves foráneas a esta
  tabla; ocultar una fila por `active` dejaría sin nombre al idioma de cualquier
  curso que aún la referencie. Filtrar entradas retiradas es cosa de la consulta,
  no de RLS. El catálogo no tiene datos personales. Se concede lectura también a
  `anon`: es un catálogo de referencia y evita una migración futura si la demo
  (FASE 10) lo necesita. Sin políticas de escritura → `anon` y `authenticated` no
  pueden modificarlo; solo `postgres` (seed, migraciones).

- **`force row level security` NO activado.** Ningún camino de la aplicación se
  conecta como propietario de la tabla: navegador y clientes SSR usan la clave
  publishable y actúan como `anon` o `authenticated` (LEX-1.8); la identidad
  llega por la cookie y los permisos por RLS. `postgres` (migraciones, seed,
  `db:test`) tiene `BYPASSRLS` —comprobado: `rolsuper=f`, `rolbypassrls=t`—, así
  que `FORCE` solo restringiría una forma de conexión que este proyecto no tiene,
  a cambio de más superficie para errores de mantenimiento. Decisión técnica
  deliberada, registrada en el comentario de la migración; no es un `Q-nnn`.

- **`course_settings` por `user_id` de una columna.** La FK compuesta
  `(course_id, user_id) → courses (id, owner_id)` ya garantiza que `user_id` es
  el dueño del curso, así que la política no necesita join a `courses`. El acceso
  indirecto por la relación queda cerrado: una fila de settings para un curso
  ajeno no puede existir (probado en `020`).

## 3. Tests — `040-identity-course-rls.sql`

Autocontenido, como `020`: crea sus propios idiomas sintéticos `zz` (uso privado
en ISO 639) y dos usuarios A y B, en vez de apoyarse en `seed.sql`.

Mecánica: dentro de la transacción, `set local role authenticated|anon|service_role`
+ `set local request.jwt.claims to '{"sub":"…","role":"…"}'`. Verificado que
`auth.uid()` lee `request.jwt.claims ->> 'sub'` (definición de `auth.uid` en el
stack local).

**Contra el fallo silencioso:** si la reclamación JWT no llegara a `auth.uid()`,
esta devolvería `NULL`, toda política denegaría todo y cada assert de «A no ve a
B» pasaría *a la vez que* «A no se ve a sí mismo». Por eso cada bloque de rol
fija primero `auth.uid()` y cada denegación va emparejada con el permiso
correspondiente.

36 asserciones:

- **Bloque 0 (esquema):** `bag_eq` sobre `pg_policies` — cada tabla expone
  exactamente su conjunto de políticas, ni una más. En particular: `profiles` sin
  `DELETE`, `languages` solo con el `SELECT` de lectura.
- **Bloque A (`auth.uid()` = A):** A se ve a sí mismo (1 perfil, y es el suyo);
  ve 1 curso y 1 `course_settings`, los suyos; **no** ve el perfil / curso /
  settings de B ni filtrando por `owner_id` de B ni por el UUID conocido del
  curso de B; lee el catálogo. A actualiza su perfil y su curso, inserta y borra
  un curso propio. A **no** puede: insertar un curso con `owner_id` de B
  (`42501`); su `UPDATE`/`DELETE` apuntando a filas de B afecta a **cero filas**.
- **Bloque B (`auth.uid()` = B):** confirma que lo de A fue real y lo de B está
  intacto — B ve solo su curso, con el título original `Curso de B` (los intentos
  de secuestro de A no lo tocaron), su perfil sin `display_name`, y no ve el curso
  de A.
- **Bloque `anon`:** cero perfiles, cero cursos, cero settings; sí lee el
  catálogo; no puede insertar en `languages` ni en `courses` (`42501`).
- **Bloque `authenticated` vs `languages`:** `UPDATE`/`DELETE` del catálogo
  afectan a cero filas; `INSERT` lanza `42501`.
- **Bloque `service_role`:** ve todos los perfiles — documenta que salta RLS a
  propósito y por eso nunca debe llegar al navegador (LEX-1.8).

```text
pnpm db:test
  000-setup.sql ................... ok
  010-rls-enabled.sql ............. ok
  020-identity-course-schema.sql .. ok
  030-languages-seed.sql .......... ok
  040-identity-course-rls.sql ..... ok
  All tests successful.   Files=5, Tests=74
```

## 4. Verificación por rotura

Con la suite en verde, se debilitó `courses_select_own` (y, por el mismo patrón,
`courses_delete_own`) a `using (true)`, `db:reset`, `db:test`:

```text
# Failed test 9:  "A sees exactly its own course"
# Failed test 10: "A cannot see B's course even filtering by B's owner_id"
# Failed test 21: "A's DELETE aimed at B's course affects zero rows"
# Failed test 24: "B's course title is untouched by A's hijack attempts"
# Failed test 26: "B cannot see A's course"
Failed 5/36 subtests
```

Fallan exactamente las asserciones de aislamiento de `courses` y ninguna otra;
la #24 además demuestra que el test detecta una mutación real (al abrir el
`DELETE`, el intento de secuestro de A borra el curso de B). Restaurada la
migración (`grep -c "= owner_id"` → 5) y `db:test` vuelve a PASS.

## 5. Verificación general

```text
pnpm db:reset   2 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test    5 ficheros, 74 asserciones, PASS
pnpm db:types   sin cambios; git diff de database.types.ts vacío
pnpm check      exit 0 (format, lint, typecheck, contraste, vitest, build)
pnpm e2e        14 passed (escritorio-chromium + movil-poco-f5)
```

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260831162304_identity_and_course_rls.sql` | Creado. 14 políticas: owner-only en `profiles` (sin DELETE), `courses`, `course_settings`; SELECT de solo lectura en `languages` para `anon, authenticated`. |
| `supabase/tests/database/040-identity-course-rls.sql` | Creado. 36 asserciones de aislamiento dueño / no-dueño / anon / service_role. |
| `docs/DATA_MODEL.md` | Cabecera de estado actualizada; sección de RLS reescrita con el conjunto de políticas real y las decisiones. |
| `docs/STATUS.md` | Fotografía de esta sesión; matiz sobre `profiles` sin DELETE. |
| `docs/no_visible_en_github/ROADMAP.md` | Fila LEX-2.3 → `HECHO` con evidencia; contadores. |
| `docs/evidence/LEX-2.3.md` | Creado. |

Migraciones añadidas: **1** (`20260831162304_identity_and_course_rls`).

## 7. Riesgos y deuda

- **La invariante de `010` cubre «RLS habilitado», no «RLS con al menos una
  política».** Una tabla de FASE 3 podría habilitar RLS y olvidarse de escribir
  políticas: quedaría en deny-all silencioso, no roto pero inservible. Ampliar
  `010` (o un `011`) a «toda tabla de `public` con RLS tiene ≥1 política, o está
  en una lista blanca explícita» es trabajo de FASE 3, fuera del alcance de
  LEX-2.3. Anotado aquí como seguimiento.
- Revisión cruzada independiente (§3.6, «políticas RLS y funciones security
  definer») no realizada: no hay segundo agente disponible. Deuda visible.
- Las políticas de INSERT en `profiles`/`courses`/`course_settings` asumen que la
  creación pasa por un camino `authenticated` (Server Action / caso de uso).
  LEX-2.4 decide trigger vs. caso de uso para el perfil; si fuera un trigger
  `SECURITY DEFINER`, correría como `postgres` y saltaría RLS — la política de
  INSERT restringida a `self` sigue siendo correcta y no estorba.

## 8. Estado del árbol Git

Rama `feat/lex-2-3-rls-policies` desde `main` (`462e016`). Pendiente de commit,
PR y CI verde antes de marcar la fila del roadmap como cerrada del todo.

## 9. Siguiente tarea

**LEX-2.4** — creación idempotente de perfil ligada a `auth.users`: reintento
seguro, perfil no duplicable, comportamiento de error probado, y decisión
trigger / caso de uso documentada. Depende de LEX-2.1 y LEX-2.3, ambas `HECHO`.
No se inicia aquí.
