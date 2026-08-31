# LEX-2.9 — Shell autenticado y selector de curso activo

**Fecha:** 2026-09-01
**Rama:** `feat/lex-2-9-app-shell`
**Estado resultante:** `HECHO`

---

## 1. Alcance

El área autenticada deja de ser un marcador de posición y pasa a estar
**asociada al curso activo** del usuario. Se añade la persistencia
(`profiles.active_course_id`) y la garantía de que un usuario no puede activar
el curso de otro cambiando un UUID.

**Fuera de alcance, declarado:**

- El **panel «Hoy»** de `MASTER_SPEC.md` §9.4 (repasos vencidos, ítems nuevos,
  tiempo estimado, `Empezar sesión`) necesita mazos y planificador (FASE 3+).
  El shell queda vacío a propósito, con el hueco anunciado en el texto.
- El **selector entre varios cursos**: en la V1 el onboarding crea uno solo, no
  hay entre qué elegir. La escritura ya está protegida (FK compuesta, probada);
  la interfaz del cambio llega cuando existan varios cursos.
- **Centralizar la puerta de onboarding**: sigue una comprobación por página en
  `(app)`. Subirla al layout necesita el `pathname` (para no entrar en bucle
  con `/onboarding`), que un layout de Server Component no tiene a mano.
  `(app)` tiene hoy dos rutas; se centraliza cuando tenga más. Deuda en
  `STATUS.md`.

## 2. Migración `20260831215553_active_course.sql`

```sql
alter table public.profiles add column active_course_id uuid;

alter table public.profiles
  add constraint profiles_active_course_fk
    foreign key (active_course_id, id)
    references public.courses (id, owner_id)
    on delete set null (active_course_id);
```

- **La propiedad es estructural.** `courses` ya trae
  `unique (id, owner_id)` (LEX-2.1, para la FK compuesta de `course_settings`).
  La PK de `profiles` es `id`, así que la misma FK compuesta ata el curso
  activo al propio usuario: un `update` que apunte al curso de otro falla con
  `23503`. No es una comprobación en la lectura.
- **`on delete set null (active_course_id)` — la lista de columnas es
  obligatoria.** `on delete set null` a secas, en una FK de varias columnas,
  pone a NULL *todas* las columnas de la FK, incluida `id` (la PK), y el
  borrado del curso falla con «null value in column "id"». Se descubrió al
  ejecutar `070` la primera vez. La forma con lista es de PostgreSQL 15+; aquí
  corre 17 (`supabase/config.toml`).
- **RLS:** sin política nueva. `profiles_update_own` (LEX-2.3, `auth.uid() = id`
  en USING y WITH CHECK) ya deja al usuario fijar su curso activo y a nadie más
  el suyo.
- **`complete_onboarding` se reemplaza** (`create or replace`) para añadir una
  línea: el `update profiles` final pone
  `active_course_id = coalesce(active_course_id, v_course_id)`. Un usuario nuevo
  sale del onboarding con curso activo; una repetición no pisa una elección
  posterior. El resto del cuerpo es idéntico al de LEX-2.7.

`pnpm db:reset` desde vacío aplica las 4 migraciones sin pasos manuales pese al
ciclo `profiles → courses → profiles(owner_id)` (la columna es nullable:
onboarding inserta el curso y luego fija el puntero).

## 3. Capas (módulo `courses`)

| Capa | Archivo | Contenido |
|---|---|---|
| Aplicación | `application/active-course.ts` | `pickActiveCourse(courses, activeCourseId)` **puro**: el que señala el puntero si sigue entre los del usuario; si no, el más antiguo; si no tiene, ninguno. Tipo `ActiveCourse`, puerto `ActiveCourseRepository`. |
| Infraestructura | `infrastructure/supabase-active-course-repository.ts` | Lee `profiles.active_course_id` y la lista de cursos del usuario (`.eq("owner_id", userId)`, ordenados por antigüedad) y delega en `pickActiveCourse`. `courses_select_own` + `profiles_select_own` hacen que solo se vea lo propio. `ActiveCourseReadError`. |
| Composición | `src/composition/courses.ts` | `getActiveCourseForCurrentUser()` — `userId` de `getClaims()`, nunca de un parámetro. |

## 4. Shell — `src/app/[locale]/(app)/app/page.tsx`

Server Component. Dos comprobaciones antes de pintar: sin onboarding →
`/onboarding`; con onboarding pero sin curso (no debería ocurrir) →
`/onboarding`. Luego renderiza el **título del curso activo** bajo la etiqueta
`App.courseLabel` y el hueco del día (`App.placeholder`, reescrito para
describir lo que vendrá). El `App.title` anterior («Área privada» / «Your
space») se retira: la cabecera ahora es el nombre del curso.

## 5. Tests

### Unitarios (`pnpm test` → 12 ficheros, 79 tests, PASS)

`active-course.test.ts` (4): sin cursos → `null`; puntero NULL → el más
antiguo; puntero válido → ese; puntero a un curso ausente → el más antiguo.

### Base de datos

- `070-active-course.sql` (nuevo, 6 asserciones): la columna admite NULL y
  arranca en NULL; A pone **su** curso como activo → se permite; A intenta el
  curso de B → `23503`, y el intento fallido no cambia nada; borrar el curso
  deja `active_course_id` en NULL sin bloquear el borrado.
- `060-onboarding-rpc.sql` (+2, ahora 34): tras el onboarding,
  `profiles.active_course_id` apunta al curso recién creado; y, tras ponerlo a
  NULL entre las dos llamadas, la segunda **lo vuelve a fijar** (prueba la rama
  de escritura del `coalesce`, no un falso verde por «ya estaba bien»).
- Total: 8 ficheros, **123 asserciones**, PASS.

### Verificación por rotura

`070` cazó el error de `on delete set null` sin lista de columnas en la primera
pasada: el `delete from courses` intentó poner `profiles.id` a NULL y violó el
NOT NULL de la PK. Corregido con `on delete set null (active_course_id)`.

### Extremo a extremo (`pnpm e2e` → 36 passed)

**Ningún e2e nuevo.** La lógica de selección del curso activo
(`pickActiveCourse`) la cubren los unitarios y `070`; el shell lo cubren de
rebote los casos ya existentes de `onboarding.spec.ts` y `protected.spec.ts`,
que ahora comprueban que tras el onboarding `/es/app` muestra el encabezado
«Inglés» (o «English» bajo interfaz `en`) y la etiqueta «Tu curso» / «Your
course». Se ajustaron **tres asserciones** de encabezado que esperaban «Área
privada» / «Your space» (el `App.title` retirado) —el mismo tipo de cambio a un
test existente que en LEX-2.8—. Un flake conocido de GoTrue en `auth.spec.ts`
(`movil-poco-f5`, `__next_error__` en el alta bajo carga paralela, ajeno a
LEX-2.9) en una pasada; re-ejecución del spec 8/8 y del conjunto 36/36.

## 6. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 12 ficheros/79, build)
pnpm db:reset  4 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test   8 ficheros / 123 asserciones, PASS
pnpm db:types  regenerado: profiles.active_course_id en Row/Insert/Update + la FK (mismo commit)
pnpm e2e       36 passed (flake de GoTrue en la 1ª pasada; 36/36 al repetir)
```

## 7. Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260831215553_active_course.sql` | Nuevo. Columna + FK compuesta + `create or replace` de `complete_onboarding`. |
| `supabase/tests/database/070-active-course.sql` | Nuevo. 6 asserciones de aislamiento. |
| `supabase/tests/database/060-onboarding-rpc.sql` | +2 asserciones (`active_course_id` fijado; re-fijado tras NULL). |
| `src/modules/courses/application/active-course.ts` (+ `.test.ts`) | Nuevo. `pickActiveCourse` puro + puerto. |
| `src/modules/courses/infrastructure/supabase-active-course-repository.ts` | Nuevo. Adaptador. |
| `src/composition/courses.ts` | Nuevo. `getActiveCourseForCurrentUser()`. |
| `src/app/[locale]/(app)/app/page.tsx` | Shell asociado al curso activo. |
| `src/shared/infrastructure/supabase/database.types.ts` | Regenerado. |
| `messages/{es,en}.json` | `App`: `courseLabel` nuevo, `title` retirado, `placeholder` reescrito. |
| `tests/e2e/{onboarding,protected}.spec.ts` | Asserciones del encabezado del shell. |
| `docs/DATA_MODEL.md`, `docs/STATUS.md`, `docs/evidence/LEX-2.9.md` | Modelo de datos y estado. |

Migraciones: **1** (`20260831215553_active_course`).

## 8. Riesgos y deuda

- **Puerta de onboarding repetida por página** en `(app)`. Se centraliza cuando
  `(app)` tenga más rutas y haya un sitio natural con acceso al `pathname`.
- **Selector de curso sin interfaz.** La persistencia y el guardián de escritura
  están; el cambio entre cursos llega con el segundo curso.
- **Panel «Hoy» (§9.4) pendiente** de mazos y planificador (FASE 3+).
- **Sin revisión cruzada independiente** (§3.6, modelo de datos y aislamiento).
  No hay segundo agente. Deuda visible.

## 9. Estado del árbol Git

Rama `feat/lex-2-9-app-shell` desde `main` (`a6fc6c8`). PR #16 fusionada a
`main` (merge `a444755`); CI verde en los tres trabajos, runs `33445445077`
(PR) y `33445695615` (merge). Rama borrada.

## 10. Siguiente tarea

**LEX-2.10** — completar manejo de estados y accesibilidad de identidad:
loading/empty/error/success, foco y anuncios, traducciones completas,
formularios sin errores críticos de accesibilidad. Depende de LEX-2.5…2.9. No
se inicia aquí.
