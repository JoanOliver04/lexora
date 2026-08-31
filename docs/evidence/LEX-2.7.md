# LEX-2.7 — Dominio y caso de uso de onboarding

**Fecha:** 2026-08-31
**Rama:** `feat/lex-2-7-onboarding`
**Estado resultante:** `HECHO`

---

## 1. Alcance

El onboarding (`MASTER_SPEC.md` §9.3) valida las elecciones del usuario y
provisiona el curso en una operación **atómica e idempotente**: un usuario que
repite el onboarding actualiza su curso, nunca acaba con dos.

De los siete pasos de §9.3, solo cuatro son entrada real:

| Paso | Dato | Validación |
|---|---|---|
| 1 | idioma de interfaz | `es` \| `en` |
| 4 | nivel académico declarado | `cefr_level` (`A1`–`B2`) |
| 5 | nivel de inicio en la app | `cefr_level`; `A1` recomendado |
| 6 | límite de ítems nuevos diarios | entero `0..100`; 5 recomendado |

Los pasos 2 y 3 son «confirmar»: el idioma de apoyo (español, `es`/`es`) y el
objetivo (inglés, `en`/`en`, `target_locale` `en-GB`) son fijos en la V1 y
viven como constantes, no como entrada.

**Sin pantallas** (son LEX-2.8). El entregable termina en la función de
composición `completeOnboardingForCurrentUser`, que LEX-2.8 llamará desde una
Server Action, igual que las de `identity` llaman a
`ensureProfileForCurrentUser()`.

**Fuera de alcance, declarado:** el paso 7 de §9.3 pide «crear el curso y los
mazos base vacíos o permitir importar material». `decks` no existe hasta
FASE 3, así que esta tarea entrega **curso + `course_settings`** y nada más.

## 2. Capas

| Capa | Archivo | Contenido |
|---|---|---|
| Dominio | `src/modules/courses/domain/onboarding.ts` | `validateOnboardingSelection(raw)` puro: enum estricto, entero en rango, **acumula todas las pegas** para que la pantalla las marque juntas. Tipos `UiLocale` / `CefrLevel`. Constantes `REFERENCE_COURSE`, `DEFAULT_START_LEVEL`, `RECOMMENDED_DAILY_NEW_LIMIT`, `DAILY_NEW_LIMIT_MIN/MAX`. Sin dependencias. |
| Aplicación | `src/modules/courses/application/complete-onboarding.ts` | Puerto `OnboardingRepository.completeOnboarding(userId, selection)`. Caso de uso `completeOnboarding(repo, userId, raw)`: rechaza `userId` vacío (error de programación), valida con el dominio, delega. `CompleteOnboardingError`. |
| Infraestructura | `src/modules/courses/infrastructure/supabase-onboarding-repository.ts` | Una sola llamada `client.rpc("complete_onboarding", { p_ui_locale, p_declared_level, p_start_level, p_daily_new_limit })`. Traduce el error de PostgREST a `CompleteOnboardingError`. |
| Composición | `src/composition/onboarding.ts` | `completeOnboardingForCurrentUser(rawSelection)`. `userId` de `client.auth.getClaims()` (firma verificada), nunca de un parámetro. Sin sesión → `null`. |

El puerto recibe `userId` pero el adaptador no lo envía a la base de datos: la
función usa `auth.uid()` de la sesión verificada. El parámetro está para que el
caso de uso pueda comprobarlo y para futuros back-ends, no para confiarlo.

## 3. Migración `20260831204649_onboarding_rpc.sql`

`public.complete_onboarding(p_ui_locale public.ui_locale, p_declared_level
public.cefr_level, p_start_level public.cefr_level, p_daily_new_limit integer)
returns uuid`.

- **SECURITY INVOKER** (el valor por defecto; ninguna `security definer`).
  Corre bajo la identidad de quien llama, así que cada escritura pasa las
  políticas de LEX-2.3: `courses_insert_own` / `_update_own`,
  `course_settings_insert_own` / `_update_own`, `profiles_update_own`,
  `courses_select_own` (para buscar el curso existente) y `languages_select_all`.
  No puede provisionar el curso de otra persona.
- `set search_path = ''`, todo esquema-cualificado (como `set_updated_at` y
  `profiles_assert_iana_timezone`).
- **Par de idiomas por `(code, locale)`**, no por UUID: los identificadores del
  seed no llegan a la aplicación. Si el catálogo no tiene `es`/`es` y `en`/`en`,
  la función lanza `P0002` en vez de insertar un curso con idioma nulo.
- **Idempotencia por regla explícita**, no por índice: `courses` no tiene UNIQUE
  sobre `owner_id` a propósito (DATA_MODEL §6.3 deja abierto un segundo par para
  fases posteriores). La función toma el curso **más antiguo** del `owner_id`
  (`order by created_at asc, id asc limit 1`) y lo actualiza; si no hay, inserta.
- `title` en el idioma de interfaz elegido (`case p_ui_locale when 'en' then
  'English' else 'Inglés' end`) **solo al insertar**: una repetición no cambia
  el título.
- La rama de actualización fija `active = true`: la postcondición es «el usuario
  tiene un curso de referencia activo».
- `course_settings`: `insert … on conflict (course_id) do update set
  daily_new_limit = excluded.daily_new_limit`.
- `profiles`: `ui_locale = p_ui_locale`, `onboarding_completed_at =
  coalesce(onboarding_completed_at, now())` — se fija una sola vez; la primera
  vez es la que cuenta.
- **Permisos:** `revoke execute … from public, anon` + `grant … to
  authenticated`. Supabase concede `EXECUTE` sobre toda función nueva de
  `public` a `anon`/`authenticated`/`service_role` por privilegios por defecto,
  así que `revoke from public` a secas dejaría a `anon` pudiendo ejecutarla.
  Anotado en `src/shared/infrastructure/supabase/README.md` para las RPC
  futuras.

`p_daily_new_limit` fuera de `0..100` lo rechaza el CHECK
`course_settings_daily_new_limit_range` (LEX-2.1): la base de datos es el
guardián último; el dominio solo permite un mensaje claro antes de llegar allí.

## 4. Tests

### Unitarios (`pnpm test` → 12 ficheros, 72 tests, PASS)

- `domain/onboarding.test.ts` (13): acepta cada `ui_locale` × cada nivel; los
  dos extremos del rango de límite; rechaza locale/nivel/entero inválidos;
  acumula las cuatro claves de una entrada entera inválida; entrada no-objeto →
  selección vacía; constantes del curso de referencia.
- `application/complete-onboarding.test.ts` (5): valida y delega con el `userId`
  y la selección normalizada; selección inválida → no toca el repositorio;
  devuelve todas las claves; `userId` vacío → `CompleteOnboardingError`;
  propaga el fallo del repositorio sin re-envolverlo.

### Base de datos — `supabase/tests/database/060-onboarding-rpc.sql` (32 asserciones)

Depende del seed (como `030`): la función resuelve el par de idiomas del
catálogo. `db:reset` lo garantiza en local y CI.

- **La función es SECURITY INVOKER** (`prosecdef = false`) y tiene `search_path`
  fijado (`proconfig`).
- **Dueño (C):** tras la primera llamada, 1 curso con `source` = `es`/`es`,
  `target` = `en`/`en`, `target_locale` `en-GB`, `declared_level`/`start_level`
  elegidos, `title` `Inglés` (interfaz `es`); `course_settings.daily_new_limit`
  = elegido; `profiles.ui_locale` = elegido; `onboarding_completed_at` fijado.
- **Idempotencia:** segunda llamada de C con **otros valores** (`en`, `A2`,
  `A2`, 10) → sigue habiendo 1 curso, el **mismo id**; `declared_level` ahora
  `A2`, `daily_new_limit` 10, `ui_locale` `en` (los valores nuevos ganan: no es
  un no-op); `title` sin cambiar; `onboarding_completed_at` **no** se pisa.
- **No-dueño (D):** D no tiene curso; ejecuta su propio onboarding y obtiene un
  curso **distinto** del de C, `title` `English` (interfaz `en`); comprobado
  desde el rol de migración que el curso de C sigue con 1 fila y sus valores
  (`A2`, límite 10) — el «curso más antiguo del `owner_id`» está acotado por
  `owner_id` bajo RLS, no por suerte de una tabla de una fila.
- **Rango:** `complete_onboarding('es','B1','A1',101)` → `23514`.
- **anon:** sin privilegio `EXECUTE` → `42501`.

### Verificación por rotura

En la primera pasada, la migración tenía solo `revoke execute … from public`.
`060` falló la asserción de `anon`: obtuvo `28000` («requires an authenticated
session», lanzado **dentro** de la función) en vez de `42501` — es decir, `anon`
tenía `EXECUTE` y entraba en la función. Confirma que la asserción discrimina.
Añadido `revoke execute … from anon` → PASS.

### Ida y vuelta real por PostgREST

pgTAP prueba la función SQL; los unitarios, el caso de uso contra un doble.
Nada de eso prueba que `client.rpc("complete_onboarding", …)` atraviese
PostgREST: que la función esté expuesta, que `authenticated` pueda invocarla por
HTTP, que los argumentos enum serialicen. Como no hay pantalla todavía, no lo
cubre ningún e2e. Una llamada real lo cierra:

```text
POST /auth/v1/signup               → token de sesión
POST /rest/v1/profiles  {id}       → HTTP 201  (lo que hace (app)/layout antes del onboarding)
POST /rest/v1/rpc/complete_onboarding
     {es, B1, A1, 5}               → HTTP 200  "a5ff638f-…-a37c8a739d64"
POST /rest/v1/rpc/complete_onboarding
     {en, A2, B1, 12}              → HTTP 200  "a5ff638f-…-a37c8a739d64"   (mismo id)

GET /rest/v1/courses          → [{ title: "Inglés", target_locale: "en-GB",
                                   declared_level: "A2", start_level: "B1", active: true }]
GET /rest/v1/course_settings  → [{ daily_new_limit: 12 }]
GET /rest/v1/profiles         → [{ ui_locale: "en", onboarding_completed_at: "2026-08-31T21:04:41…Z" }]
```

Los valores de la segunda llamada ganan; `title` no cambia (rama de
actualización); `onboarding_completed_at` es el de la primera.

## 5. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 12 ficheros/72, build)
pnpm db:reset  3 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test   000 · 010 · 020 · 030 · 040 · 050 · 060 — All tests successful, 115 asserciones
pnpm db:types  regenerado; git diff = Functions.complete_onboarding (Args tipados + Returns string)
pnpm e2e       28 passed (14 portada + 8 auth + 6 puerta)
```

`pnpm db:types` **sí cambia** esta vez (toda tarea desde LEX-2.1 lo reportaba
«sin cambios»): una RPC nueva aparece en el tipo `Functions`. Regenerado y
confirmado en el mismo commit que la migración.

Nota e2e: el primer `pnpm e2e` completo dio 1 fallo (`movil-poco-f5`, alta,
`__next_error__` en la Server Action de signup — transitorio de GoTrue con los
dos proyectos en paralelo; nada importa el módulo nuevo). Re-ejecución del spec:
8/8. Re-ejecución completa: 28/28.

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260831204649_onboarding_rpc.sql` | Nuevo. Función `complete_onboarding` SECURITY INVOKER, idempotente. |
| `supabase/tests/database/060-onboarding-rpc.sql` | Nuevo. 32 asserciones (dueño / no-dueño / anon / idempotencia). |
| `src/modules/courses/domain/onboarding.ts` (+ `.test.ts`) | Nuevo. Validación pura + constantes del curso de referencia. |
| `src/modules/courses/application/complete-onboarding.ts` (+ `.test.ts`) | Nuevo. Puerto + caso de uso. |
| `src/modules/courses/infrastructure/supabase-onboarding-repository.ts` | Nuevo. Adaptador `client.rpc`. |
| `src/composition/onboarding.ts` | Nuevo. `completeOnboardingForCurrentUser`. |
| `src/shared/infrastructure/supabase/database.types.ts` | Regenerado; aparece `complete_onboarding`. |
| `src/shared/infrastructure/supabase/README.md` | Nota sobre los privilegios `EXECUTE` por defecto de Supabase. |
| `docs/DATA_MODEL.md` | Entrada de `complete_onboarding` bajo un nuevo apartado «Funciones». |
| `docs/STATUS.md` | Sincronizado (LEX-2.6 ya en `main`); bloque LEX-2.7. |
| `docs/evidence/LEX-2.7.md` | Nuevo. |

Migraciones: **1** (`20260831204649_onboarding_rpc`).

## 7. Decisiones

- **`courses.title` se escribe en el idioma de interfaz elegido**, solo en la
  rama de inserción. Alternativa descartada: un `name_key` como en `languages`
  —añade indirección para un único string y no aporta hasta que haya varios
  cursos—. Es una fila permanente y visible para el usuario.
- **Operación en una función SQL, no en cuatro llamadas desde la aplicación**
  (ADR-002). Cuatro `POST` a PostgREST podrían aplicarse a medias si la petición
  se corta entre ellos y dejar un curso sin `course_settings`.
- **SECURITY INVOKER, no DEFINER.** No añade una función privilegiada que
  requeriría la revisión cruzada de §3.6; las políticas de LEX-2.3 siguen siendo
  la barrera.
- **Módulo `courses` nuevo** (ARCHITECTURE §5: «idiomas, cursos y configuración
  educativa»). Cuatro capas porque la operación no es trivial.

## 8. Riesgos y deuda

- **Sin revisión cruzada independiente** (§3.6): la función `complete_onboarding`
  se suma a la lista (RLS, ADR-005, sesión SSR, redirects). No hay segundo
  agente. Deuda visible. Mitigación: SECURITY INVOKER, sin ampliación de
  superficie.
- **`completeOnboardingForCurrentUser` sin llamador** hasta LEX-2.8. El
  `(app)/layout.tsx` ya asegura el perfil antes de que se pueda invocar, así que
  el FK `courses_owner_id_fkey` está cubierto por el flujo real (se comprobó en
  la ida y vuelta por PostgREST: sin fila de perfil, `23503`).
- **`active = true` en la rama de actualización es latente:** no hay ruta de
  desactivación de cursos hasta FASE 3+. Se fija ahora para que la postcondición
  sea honesta y no cueste una segunda migración después.
- **Un `title` fijo por idioma** no cubre más idiomas de interfaz futuros; hoy
  solo hay `es`/`en` y el enum `ui_locale` los cierra.

## 9. Estado del árbol Git

Rama `feat/lex-2-7-onboarding` desde `main` (`c0c9594`). Pendiente de commit,
PR y CI.

## 10. Siguiente tarea

**LEX-2.8** — pantallas de onboarding. Consume
`completeOnboardingForCurrentUser`. Depende de LEX-2.7. No se inicia aquí.
