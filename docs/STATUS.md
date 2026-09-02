# Lexora — Estado actual

**Última actualización:** 2026-09-02
**Fase actual:** **FASE 3 — Biblioteca, mazos y conceptos** — `EN PROCESO` (1/12). FASE 2 `HECHO` (11/11)
**Hito actual:** M3 — Biblioteca manual usable — `PENDIENTE`. M2 `HECHO`
**Tarea activa:** ninguna
**Estado de la tarea:** LEX-3.1 `HECHO` · siguiente LEX-3.2 · abierta Q-005
**Rama / commit base / HEAD:** `main` en `426b2b3` (PR #22, LEX-3.1). Sin rama de trabajo activa.

> El roadmap detallado y la especificación maestra son documentos privados y
> locales; no forman parte de este repositorio público. Ver
> [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) Q-002.

---

## Terminado en esta sesión

### LEX-3.1 — Modelo de dominio de biblioteca — `HECHO`

Informe en [`evidence/LEX-3.1.md`](evidence/LEX-3.1.md). PR #22 fusionada a
`main` (merge `426b2b3`); CI verde en los tres trabajos, runs `33657579290`
(PR; el job «Base de datos» reintentado tras un `toomanyrequests` /
`address already in use` del runner, ajeno) y `33658253752` (merge). **Sin
migración, sin tocar SQL ni pantallas.**

Primer paso de FASE 3 / M3: el dominio puro del módulo `library`. Cinco ficheros
en `src/modules/library/domain/` (uno por concepto cohesivo, patrón de
`courses/domain/onboarding.ts`):

- **`taxonomy.ts`** — `CefrLevel` (no importado de `courses`; *feature-first*),
  `DeckCategory`, `ConceptKind`, `PracticeMode` (los **siete** reservados de
  §13.9), `V1_PRACTICE_MODES` (los tres activables); helpers de texto
  (`normalizeWhitespace` sin tocar acentos, `readOptionalText`, límites de
  longitud).
- **`deck.ts` / `concept.ts` / `practice-item.ts` / `tag.ts`** — `interface`
  persistido + `*Draft` editable + `validate*Draft(raw)` que acumula todas las
  pegas con claves estables, más helpers puros: `canonicalKey` (concepto),
  `normalizeTagName` / `tagSegments` (tag), `canReverse` / `reverseOf` (ítem:
  la dirección inversa es **otro ítem del mismo concepto**, nunca otro
  concepto).
- **`PracticeItemConfig`**: unión discriminada por `mode`; `cloze` guarda
  `answers: string[]`; los cuatro modos futuros solo el discriminante. Validado
  sin Zod (eso es el borde, LEX-3.4).

**Interpretación declarada:** «profesional» (§9.5) se modela como `category`, no
como nivel — §13.6 nombra la columna `cefr_level` (solo MCER). Pendiente de
confirmación del propietario; afecta a LEX-3.2.

**Regla de capas:** `eslint.config.mjs` la aplica por glob (`src/**/domain/**`),
así que `library/domain` queda cubierto sin cambios. Verificado por rotura:
`import` de `@supabase/*` en `taxonomy.ts` → `pnpm lint` falla. Revertido.

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 8/8, vitest 19 ficheros/128, build)
pnpm db:test   8 ficheros / 123 asserciones, PASS (sin cambios: no toca SQL)
pnpm db:types  sin cambios (no hay migración)
```

### LEX-2.11 — Auditoría E2E y de M2 con dos usuarios — `HECHO` · cierra M2

Informe en [`evidence/LEX-2.11.md`](evidence/LEX-2.11.md). PR #20 fusionada a
`main` (merge `0f36ed1`); CI verde en los tres trabajos, runs `33654445913`
(PR) y `33654786410` (merge). **Con esto FASE 2 `HECHO` (11/11) y M2 `HECHO`.**
**Sin migración.**

Pasada de conjunto sobre M2: recorre los flujos de punta a punta y comprueba el
aislamiento A/B en las tres capas. La tabla de `evidence/LEX-2.11.md` §2 mapea
cada criterio de salida de M2 a su prueba (pgTAP `040`/`050`/`060`/`070`, E2E
`auth`/`protected`/`onboarding`, `db:reset` desde vacío).

- **`tests/e2e/isolation.spec.ts`** (nuevo): dos contextos de navegador con
  sesión a la vez; A hace el onboarding en español, B en inglés; cada uno ve su
  curso, y la actividad de uno no cambia lo del otro. Señal que identifica al
  dueño: `courses.title` se fija al crear a partir del `ui_locale` de ese
  usuario, así que el curso de A se titula «Inglés» y el de B «English» **aunque
  se miren bajo el otro locale**.
- **`tests/e2e/helpers.ts`** (nuevo): unifica `uniqueEmail` / `signUp` /
  `completeOnboarding`, que cuatro specs repetían. `auth`, `protected`,
  `onboarding` e `identity-a11y` pasan a importarlos; ningún caso cambia de
  comportamiento.
- **Flake de GoTrue — decisión.** Hipótesis de límite de peticiones
  (`sign_in_sign_ups = 30`) **descartada por sondeo**: 45 altas seguidas, todas
  `200` — el stack local no aplica ese límite. No reproducible en ~10 pasadas
  dirigidas con instrumentación. Decisión: `signUp` reintenta el alta **una vez,
  con correo nuevo**, si no cae en `/es` en 10 s — reintento de *preparación*,
  no política global; `playwright.config.ts` mantiene `retries: 0` en local.

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 8/8, vitest 14 ficheros/85, build)
pnpm db:reset  4 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test   8 ficheros / 123 asserciones, PASS (sin cambios: no toca esquema)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       46 passed (44 previos + isolation ×2); 12 pasadas seguidas sin flake tras el reintento
```

### LEX-2.10 — Manejo de estados y accesibilidad de identidad — `HECHO`

Informe en [`evidence/LEX-2.10.md`](evidence/LEX-2.10.md). PR #18 fusionada a
`main` (merge `4619dbe`); CI verde en los tres trabajos, runs `33650503266`
(PR) y `33650912529` (merge). **Sin migración.**

Pulido transversal de las vistas de identidad. Los cuatro estados de cada
formulario, foco y anuncios, y un candado de completitud de traducciones.

- **`useFocusFirstInvalid`** (`src/shared/presentation/hooks/`): tras cada envío
  fallido lleva el foco al primer `[aria-invalid="true"]`. Depende del **objeto
  de estado** de `useActionState` (nuevo en cada envío), no del código de error:
  recoloca el foco aunque el usuario lo haya movido y el error se repita. El
  foco va al campo, no al `role="alert"` (que ya se anuncia solo al insertarse);
  el campo apunta a la región con `aria-describedby`.
- **`FormError`** (`src/shared/presentation/components/`): región `role="alert"`
  con `id` estable por formulario. Los cinco formularios de identidad pasan a
  usarla; el `role="alert"` deja el `<p>` y pasa al contenedor.
- **`FormStatus`**: las tres pantallas de éxito (`signup`, `forgot-password`,
  `reset-password`) sustituyen el formulario por un `role="status"` que **toma
  el foco al montarse** (`tabIndex={-1}`) — sin esto el foco caería a `<body>`
  al desaparecer el botón.
- **Grupos de radio del onboarding** (deuda anotada en LEX-2.8): un grupo
  inválido es `<fieldset aria-invalid tabIndex={-1} aria-describedby>` con la
  `<legend>` en color de error.
- **`parity.test.ts`**: camina el árbol completo de `messages/{es,en}.json` y
  afirma en las dos direcciones que las claves coinciden y que ningún valor está
  vacío. Verificado por rotura (borrar `Auth.login.submit` de `en` → falla).

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 8/8, vitest 14 ficheros/85, build)
pnpm db:test   8 ficheros / 123 asserciones, PASS (sin cambios: no toca esquema)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       44 passed (identity-a11y ×4 nuevos; verde a la primera en la última pasada)
```

`auth.spec.ts`: una aserción ajustada (`role="alert"` pasó del `<p>` al
contenedor `#login-error`). Mismo tipo de cambio a un test existente que en
LEX-2.8 y LEX-2.9.

### LEX-2.9 — Shell autenticado y curso activo — `HECHO`

Informe completo en [`evidence/LEX-2.9.md`](evidence/LEX-2.9.md).

El área autenticada deja de ser un marcador de posición y queda **asociada al
curso activo** del usuario.

- **Migración `20260831215553_active_course.sql`:** `profiles.active_course_id`
  con **FK compuesta** `(active_course_id, id) → courses (id, owner_id)` y
  `on delete set null (active_course_id)`. La columna `id` en la FK hace que el
  curso activo solo pueda ser un curso propio —un `update` al curso de otro
  falla con `23503`, no «se filtra al leer»—, igual que
  `course_settings(course_id, user_id)`. **La lista de columnas en `set null` es
  obligatoria:** sin ella pondría `id` (la PK) a NULL y el borrado del curso
  fallaría (PostgreSQL 15+; aquí 17). RLS: sin política nueva, `profiles_update_own`
  ya la cubre. `complete_onboarding` se reemplaza (`create or replace`) para
  fijar `active_course_id = coalesce(active_course_id, curso)` al provisionar.
- **Módulo `courses`:** `pickActiveCourse(courses, activeId)` puro (puntero si
  sigue entre los suyos; si no, el más antiguo; si no, ninguno) + puerto
  `ActiveCourseRepository` + adaptador + composición
  `getActiveCourseForCurrentUser()`.
- **Shell** (`(app)/app/page.tsx`): encabezado = título del curso activo bajo
  `App.courseLabel`; el hueco del día describe lo que vendrá. `App.title`
  retirado. El panel «Hoy» (§9.4) necesita mazos/planificador → FASE 3+.
- **Puerta de onboarding:** sigue por página (subirla al layout necesita el
  `pathname`; `(app)` tiene dos rutas). Deuda anotada.

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 12 ficheros/79, build)
pnpm db:reset  4 migraciones + seed desde vacío
pnpm db:test   8 ficheros / 123 asserciones, PASS  (070 nuevo: aislamiento del curso activo)
pnpm db:types  regenerado: profiles.active_course_id (Row/Insert/Update + FK)
pnpm e2e       36 passed (flake de GoTrue en auth.spec bajo carga paralela; 36/36 al repetir)
```

**Verificación por rotura:** `070` cazó `on delete set null` sin lista de
columnas —el `delete` intentaba poner `profiles.id` a NULL—. Corregido a
`on delete set null (active_course_id)`.

Selector entre varios cursos: sin interfaz hasta que exista un segundo curso;
la persistencia y el guardián de escritura ya están.

### LEX-2.8 — Construir onboarding ES/EN — `HECHO`

Informe completo en [`evidence/LEX-2.8.md`](evidence/LEX-2.8.md).

Pantalla de onboarding sobre `completeOnboardingForCurrentUser` (LEX-2.7). Sin
migración.

- **Ruta** `src/app/[locale]/(app)/onboarding/` — `page.tsx` (Server Component,
  redirige a `/{locale}/app` si el onboarding ya está hecho), `onboarding-form.tsx`
  (cliente, `useActionState`), `actions.ts` (Server Action delgada: `uiLocale` y
  `locale` validados contra `routing.locales` antes de `redirect()`; un campo de
  número vacío se fuerza a `NaN` para que el dominio lo rechace, no a `0`).
- **Flujo corto de una pantalla** (§9.3): idioma de interfaz (radios), idiomas
  de apoyo/objetivo confirmados (texto fijo), nivel declarado, nivel de inicio
  (A1 por defecto) y límite de ítems nuevos (5 por defecto, `type="number"`).
  Aclaración visible de que el nivel declarado no certifica dominio ni bloquea
  contenido. En éxito redirige a `/{uiLocale}/app` —la app aparece en el idioma
  recién elegido, único punto que hoy lee `profiles.ui_locale`—.
- **Puerta de onboarding:** `(app)/app/page.tsx` redirige a `/{locale}/onboarding`
  si falta; el onboarding redirige a `/app` si ya está. Sin bucle porque cada
  página comprueba su lado. `PROTECTED_SEGMENTS` de `protected-paths.ts` pasa a
  `["app", "onboarding"]` para que el proxy conserve `?next=` y marque
  `no-store` también aquí.
- **Estado de onboarding:** `ProfileRepository.hasCompletedOnboarding(userId)`
  (identity es dueño de `profiles`) — `maybeSingle()`, sin fila ⇒ `false`.
  Composición `hasCompletedOnboardingForCurrentUser()`.
- i18n ES/EN: namespace `Onboarding` (claves de error con `_`, no `.`, para no
  colisionar con el anidado de next-intl).

**Test existente ajustado:** `protected.spec.ts` («tras entrar se llega al
destino guardado») ahora completa el onboarding una vez tras el alta; sin eso,
`/es/app` rebotaría al onboarding y el `toHaveURL("/es/app")` fallaría. Es
consecuencia directa de la nueva puerta, no un flake.

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 11 ficheros/75, build)
pnpm db:test   7 ficheros / 115 asserciones, PASS (sin cambios: LEX-2.8 no toca esquema)
pnpm db:types  sin cambios
pnpm e2e       36 passed (28 previos + 8: onboarding ×2 dispositivos — puerta, idioma en bajo /en, ui_locale→/en/app, límite fuera de rango)
```

Manejo fino de estados y auditoría de accesibilidad: LEX-2.10.

### LEX-2.7 — Dominio y caso de uso de onboarding — `HECHO`

Informe completo en [`evidence/LEX-2.7.md`](evidence/LEX-2.7.md).

Módulo `courses` (nuevo). El onboarding (`MASTER_SPEC.md` §9.3) valida las
cuatro elecciones reales del usuario —idioma de interfaz `es`/`en`, nivel
académico declarado, nivel de inicio, límite de ítems nuevos diarios 0..100— y
provisiona el curso en **una operación atómica e idempotente**. El idioma de
apoyo (español), el objetivo (inglés `en-GB`) y el paso 7 son fijos/operación,
no entrada.

- **Dominio** (`domain/onboarding.ts`): `validateOnboardingSelection` puro
  —enum estricto, entero en rango, acumula todas las pegas—, tipos `UiLocale` /
  `CefrLevel`, constantes del curso de referencia. Sin dependencias.
- **Aplicación** (`application/complete-onboarding.ts`): puerto
  `OnboardingRepository.completeOnboarding(userId, selection)`, caso de uso
  (valida → delega), `CompleteOnboardingError`.
- **Infraestructura** (`infrastructure/supabase-onboarding-repository.ts`): una
  sola llamada `client.rpc("complete_onboarding", …)`.
- **Composición** (`src/composition/onboarding.ts`):
  `completeOnboardingForCurrentUser(rawSelection)` — `userId` de `getClaims()`,
  nunca de un parámetro. Sin llamador: lo consume LEX-2.8.

**Migración `20260831204649_onboarding_rpc.sql`:** función
`public.complete_onboarding(ui_locale, cefr_level, cefr_level, integer)
returns uuid`, **SECURITY INVOKER** (cada escritura pasa las políticas RLS de
LEX-2.3), `search_path` fijado. Resuelve el par de idiomas del catálogo por
`(code, locale)` —los UUID del seed no llegan a la aplicación—; busca el curso
más antiguo del `owner_id` y lo actualiza, o inserta uno; upsert de
`course_settings`; fija `ui_locale` y `onboarding_completed_at` (una sola vez,
`coalesce`). `title` en el idioma de interfaz solo al insertar. Rama de
actualización fuerza `active = true`. `revoke execute … from public, anon` +
`grant … to authenticated` (Supabase concede EXECUTE a `anon` por privilegios
por defecto: `revoke from public` a secas no basta).

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 10 ficheros/72, build)
pnpm db:reset  3 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test   7 ficheros, 115 asserciones, PASS  (060: dueño C + no-dueño D + anon)
pnpm db:types  database.types.ts regenerado: aparece complete_onboarding (mismo commit)
pnpm e2e       28 passed (sin pantallas nuevas; el módulo aún no tiene llamador)
```

**Ida y vuelta real por PostgREST** (la única costura que pgTAP y los unitarios
no tocan): alta por `/auth/v1/signup` → `POST /rest/v1/rpc/complete_onboarding`
con el token → `HTTP 200` + uuid; segunda llamada con otros valores → **mismo**
uuid, y ganan los valores nuevos (`declared_level A2`, `daily_new_limit 12`,
`ui_locale en`), `title` sin cambiar, `active true`, `onboarding_completed_at`
intacto.

**Verificación por rotura:** en la primera pasada, `060` con solo
`revoke … from public` falló la asserción de `anon` (`28000`, no `42501`) —
`anon` seguía teniendo EXECUTE por los privilegios por defecto de Supabase.
Añadido `revoke … from anon` → PASS.

**Decisión:** `courses.title` se escribe en el idioma de interfaz elegido
(`case p_ui_locale when 'en' then 'English' else 'Inglés' end`) solo en la
rama de inserción. Alternativa descartada: un `name_key` como en `languages`,
que añade indirección para un único string y no aporta hasta que haya varios
cursos. Queda como fila permanente y visible.

**Fuera de alcance (declarado):** los mazos base vacíos y la importación del
paso 7 de §9.3 —`decks` no existe hasta FASE 3—; las pantallas —LEX-2.8.

### LEX-2.6 — Proteger rutas y mantener sesión SSR — `HECHO`

Informe completo en [`evidence/LEX-2.6.md`](evidence/LEX-2.6.md).

Dos barreras para el área autenticada:

- **Proxy** (`src/proxy.ts`) — comodidad: ruta privada sin sesión → redirige a
  `/{locale}/login?next=<ruta segura>` y marca la respuesta
  `Cache-Control: private, no-store`.
- **Layout de `(app)`** (`src/app/[locale]/(app)/layout.tsx`) — barrera de
  verdad: `getCurrentUserId()` en el servidor en cada render; sin sesión,
  redirige a `login` **a secas** (el `next` lo posee el proxy); con sesión,
  `ensureProfileForCurrentUser()` — cierra la ventana de ADR-005. `force-dynamic`.

`refreshSupabaseSession` ahora devuelve `{ response, userId }` (un solo
`getClaims()` por petición).

**Corregido un fallo latente del `matcher` de `proxy.ts`** (desde LEX-1.5): `\.`
en la cadena JavaScript se quedaba en `.` («cualquier carácter»), y el negative
lookahead descartaba toda ruta con contenido: **el proxy solo se ejecutaba en
`/`**. La renovación de sesión de LEX-1.8 no llegaba a correr en `/{locale}/…`.
Corregido a `.*\\..*`. Comprobado contra un servidor de producción.

`isProtectedPath` (aplicación, puro): hoy solo `/{locale}/app` y lo que cuelgue;
comprueba el pathname tal cual y decodificado (evasión por %-encoding). Marcador
de posición en `/{locale}/app`; la home real es LEX-2.9.

```text
pnpm check     exit 0 (format, lint, typecheck, contraste, vitest 8 ficheros/54, build)
pnpm db:test   6 ficheros, 83 asserciones, PASS
pnpm e2e       28 passed (14 portada + 8 auth + 6 puerta)
pnpm db:types  sin cambios
```

Sin migración. Renovación de token en expiración: comprobación manual / FASE 9.

### LEX-2.5 — Registro, login, logout y recuperación — `HECHO`

Informe completo en [`evidence/LEX-2.5.md`](evidence/LEX-2.5.md).

Flujos de correo y contraseña con Supabase Auth SSR. Módulo `identity`:

- **Aplicación:** `credentials` (Zod, claves estables), `safe-redirect`
  (`resolveSafeRedirect`: solo rutas internas), `auth-gateway` (puerto +
  errores), `auth-flows` (casos de uso; un fallo de infraestructura es
  `auth-unavailable`, no una excepción).
- **Infraestructura:** `supabase-auth-gateway` — traduce los errores de GoTrue.
- **Composición:** `registerVisitor` / `signInVisitor` / `signOutVisitor` /
  `requestPasswordResetFor` / `updateCurrentPassword` / `completeAuthCallback` /
  `getCurrentUserId`. Tras autenticar llama a `ensureProfileForCurrentUser()`.
- **Presentación:** `(auth)/` con login/signup/forgot-password/reset-password
  (Server Component + form con `useActionState`), Server Actions delgadas
  (`locale` y `next` validados antes de `redirect()`), callback en
  `/api/auth/callback` (fuera del `matcher` del proxy), `SessionControls` en la
  portada. i18n ES/EN (namespace `Auth`).

**No revela si un correo existe (§12.6):** alta con correo repetido
(`user_already_exists`, 422 en local con `enable_confirmations=false`) → mismo
resultado que un alta nueva; login = un solo mensaje `invalid-credentials`;
recuperación responde igual exista o no la cuenta.

`supabase/config.toml`: `site_url` local pasa a `http://localhost:3000` (lo que
sirven `pnpm start` y Playwright). Sin ese cambio, GoTrue descarta el
`redirectTo` del correo de recuperación. Solo entorno local. **Sin migración.**

```text
pnpm check     exit 0 (format, lint, typecheck, contraste, vitest 7 ficheros/48, build)
pnpm db:test   6 ficheros, 83 asserciones, PASS
pnpm e2e       22 passed (14 portada + 8 auth: alta→logout→login por cookie,
               contraseña incorrecta genérica, recuperación neutral, /en en inglés)
pnpm db:types  sin cambios
```

Entregado como un solo PR pese a `ROADMAP.md` §2.5 (cinco pantallas), por
indicación del propietario de no detenerse a preguntar.

### LEX-2.4 — Creación idempotente de perfil — `HECHO`

Informe completo en [`evidence/LEX-2.4.md`](evidence/LEX-2.4.md).

**ADR-005 — creación de perfil = caso de uso, no trigger.** `MASTER_SPEC.md`
§9.2 pide «creación automática e idempotente del perfil». Se elige un caso de
uso de la capa de aplicación en vez de un trigger `SECURITY DEFINER` sobre
`auth.users`: alinea con ADR-001/-002, evita una función `security definer` sin
la revisión cruzada que exige §3.6 y que no está disponible, y la política
`profiles_insert_own` (LEX-2.3) ya hace de segunda barrera. **Sin migración:**
la unicidad la da la PK de `profiles` (LEX-2.1); la idempotencia,
`INSERT … ON CONFLICT (id) DO NOTHING`.

- `src/modules/identity/application/ensure-profile.ts` — puerto
  `ProfileRepository.ensureExists`, caso de uso `ensureProfile`,
  `EnsureProfileError`, resultado `created` / `already-existed`.
- `src/modules/identity/infrastructure/supabase-profile-repository.ts` —
  `upsert` con `ignoreDuplicates`; `select()` vacío ⇒ ya existía.
- `src/composition/identity.ts` — `ensureProfileForCurrentUser()`: el `userId`
  sale de `getClaims()` (firma verificada), nunca de un parámetro. Sin llamador
  todavía: lo consumen LEX-2.5 y LEX-2.6.
- Sin carpeta `domain/` en el módulo: no hay lógica pura que colocar.

Tests: `ensure-profile.test.ts` con repo en memoria (crea / idempotente /
concurrencia / id vacío / propaga error) y `050-profile-creation.sql`
(9 asserciones; `auth.uid()` fijado; ensure inserta 1 → segundo 0; insert
duplicado a pelo → `23505`, que es lo que hace el perfil no duplicable, no el
`ON CONFLICT`; A no crea perfil de B → `42501`; anon → `42501`).

```text
pnpm db:test   6 ficheros, 83 asserciones, PASS
pnpm check     exit 0 (format, lint, typecheck, contraste, vitest 22, build)
pnpm e2e       14 passed
```

**Verificación por rotura:** en una transacción revertida, `drop constraint
profiles_pkey` → los dos insert a pelo dejan 2 filas; confirma que la asserción
`23505` de `050` es la que discrimina. Las `42501` replican el patrón ya
verificado por rotura en `040`.

**Ventana sin perfil** entre el alta y la primera petición propia: aceptada en
ADR-005, se cierra en LEX-2.6.

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

Ninguna tarea `EN PROCESO`. FASE 3 en 1/12. LEX-3.1 en `main` (`426b2b3`).

Siguiente: **LEX-3.2** — migraciones de `decks`, `concepts`, `deck_concepts`,
`practice_items`, `tags` y `concept_tags`. Depende de LEX-3.1. **Antes de fijar
`decks.cefr_level` hay que resolver o confirmar Q-005** (recomendación:
`professional` es categoría, no nivel).

Acción pendiente del propietario: **etiqueta de hito M2** (`v0.3.0-m2` o la que
Joan decida) — no se crea sin autorización expresa (CLAUDE.md §4); y **decidir
Q-005**.

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
| `src/modules/identity/application/ensure-profile.{ts,test.ts}` | LEX-2.4: creado. Puerto `ProfileRepository`, caso de uso `ensureProfile`, tests con repo en memoria. |
| `src/modules/identity/infrastructure/supabase-profile-repository.ts` | LEX-2.4: creado. Adaptador `upsert` idempotente. |
| `src/composition/identity.ts` | LEX-2.4: creado. `ensureProfileForCurrentUser()`. |
| `supabase/tests/database/050-profile-creation.sql` | LEX-2.4: creado. 9 asserciones. |
| `docs/adrs/ADR-005-creacion-de-perfil.md`, `docs/adrs/README.md` | LEX-2.4: ADR-005 y su fila en el índice. |
| `docs/DATA_MODEL.md` | LEX-2.4: nota sobre la creación de la fila de perfil. |
| `docs/evidence/LEX-2.4.md` | Creado. |
| `src/modules/identity/application/{credentials,safe-redirect,auth-gateway,auth-flows}.ts` (+ 3 `.test.ts`) | LEX-2.5: creados. Puertos y casos de uso de autenticación. |
| `src/modules/identity/infrastructure/supabase-auth-gateway.ts` | LEX-2.5: creado. Adaptador sobre `supabase.auth.*`. |
| `src/composition/identity.ts` | LEX-2.5: ampliado con los cinco flujos + `getCurrentUserId` + `completeAuthCallback`. |
| `src/app/[locale]/(auth)/` | LEX-2.5: layout, `actions.ts`, 4×{page + form}, `_components/`. |
| `src/app/[locale]/session-controls.tsx`, `src/app/[locale]/page.tsx` | LEX-2.5: control de sesión en la portada (la hace dinámica). |
| `src/app/api/auth/callback/route.ts` | LEX-2.5: canje del `code` del enlace de correo. |
| `messages/{es,en}.json` | LEX-2.5: namespace `Auth`. |
| `supabase/config.toml` | LEX-2.5: `site_url` local → `http://localhost:3000`; `additional_redirect_urls`. |
| `tests/e2e/auth.spec.ts` | LEX-2.5: creado. 4 casos × 2 dispositivos. |
| `docs/evidence/LEX-2.5.md` | Creado. |
| `src/proxy.ts` | LEX-2.6: puerta de rutas privadas + `Cache-Control` + corrección del `matcher`. |
| `src/shared/infrastructure/supabase/session.ts` | LEX-2.6: `refreshSupabaseSession` devuelve `{ response, userId }`. |
| `src/modules/identity/application/protected-paths.{ts,test.ts}` | LEX-2.6: creado. `isProtectedPath`. |
| `src/app/[locale]/(app)/{layout,app/page}.tsx` | LEX-2.6: creado. Barrera autoritativa + marcador de posición. |
| `messages/{es,en}.json` | LEX-2.6: namespace `App`. |
| `tests/e2e/protected.spec.ts` | LEX-2.6: creado. 3 casos × 2 dispositivos. |
| `docs/evidence/LEX-2.6.md` | Creado. |
| `supabase/migrations/20260831204649_onboarding_rpc.sql` | LEX-2.7: creado. Función `complete_onboarding` SECURITY INVOKER, idempotente. |
| `supabase/tests/database/060-onboarding-rpc.sql` | LEX-2.7: creado. 32 asserciones: dueño C, no-dueño D, anon; idempotencia con valores distintos. |
| `src/modules/courses/domain/onboarding.{ts,test.ts}` | LEX-2.7: creado. Validación pura + constantes del curso de referencia. |
| `src/modules/courses/application/complete-onboarding.{ts,test.ts}` | LEX-2.7: creado. Puerto `OnboardingRepository` + caso de uso. |
| `src/modules/courses/infrastructure/supabase-onboarding-repository.ts` | LEX-2.7: creado. Adaptador `client.rpc`. |
| `src/composition/onboarding.ts` | LEX-2.7: creado. `completeOnboardingForCurrentUser`. |
| `src/shared/infrastructure/supabase/database.types.ts` | LEX-2.7: regenerado; aparece `complete_onboarding`. |
| `src/shared/infrastructure/supabase/README.md` | LEX-2.7: nota sobre los privilegios EXECUTE por defecto de Supabase. |
| `docs/DATA_MODEL.md` | LEX-2.7: entrada de `complete_onboarding`. |
| `docs/evidence/LEX-2.7.md` | Creado. |
| `src/app/[locale]/(app)/onboarding/{page,onboarding-form,actions}.{tsx,ts}` | LEX-2.8: creado. Pantalla de onboarding + Server Action. |
| `src/app/[locale]/(app)/app/page.tsx` | LEX-2.8: puerta — redirige a `/onboarding` si falta. |
| `src/modules/identity/application/ensure-profile.ts` (+ `.test.ts`) | LEX-2.8: `ProfileRepository.hasCompletedOnboarding`. |
| `src/modules/identity/infrastructure/supabase-profile-repository.ts` | LEX-2.8: lee `onboarding_completed_at` (`maybeSingle`). |
| `src/modules/identity/application/protected-paths.{ts,test.ts}` | LEX-2.8: `onboarding` entra en `PROTECTED_SEGMENTS`. |
| `src/composition/onboarding.ts` | LEX-2.8: `hasCompletedOnboardingForCurrentUser`. |
| `messages/{es,en}.json` | LEX-2.8: namespace `Onboarding`. |
| `tests/e2e/onboarding.spec.ts` | LEX-2.8: creado. 3 casos × 2 dispositivos. |
| `tests/e2e/protected.spec.ts` | LEX-2.8: el test del destino guardado completa el onboarding tras el alta. |
| `docs/evidence/LEX-2.8.md` | Creado. |
| `supabase/migrations/20260831215553_active_course.sql` | LEX-2.9: creado. `profiles.active_course_id` + FK compuesta + `create or replace` de `complete_onboarding`. |
| `supabase/tests/database/070-active-course.sql` | LEX-2.9: creado. 6 asserciones de aislamiento del curso activo. |
| `supabase/tests/database/060-onboarding-rpc.sql` | LEX-2.9: +2 asserciones (`active_course_id` fijado; re-fijado tras NULL entre llamadas). |
| `src/modules/courses/application/active-course.{ts,test.ts}` | LEX-2.9: creado. `pickActiveCourse` puro + puerto. |
| `src/modules/courses/infrastructure/supabase-active-course-repository.ts` | LEX-2.9: creado. Adaptador. |
| `src/composition/courses.ts` | LEX-2.9: creado. `getActiveCourseForCurrentUser()`. |
| `src/app/[locale]/(app)/app/page.tsx` | LEX-2.9: shell asociado al curso activo (antes marcador de posición). |
| `src/shared/infrastructure/supabase/database.types.ts` | LEX-2.9: regenerado (`active_course_id`). |
| `messages/{es,en}.json` | LEX-2.9: `App.courseLabel` nuevo, `App.title` retirado, `placeholder` reescrito. |
| `tests/e2e/{onboarding,protected}.spec.ts` | LEX-2.9: asserciones del encabezado del shell (curso activo). |
| `docs/DATA_MODEL.md` | LEX-2.9: `active_course_id` y la FK compuesta. |
| `docs/evidence/LEX-2.9.md` | Creado. |
| `src/shared/presentation/hooks/use-focus-first-invalid.{ts,test.tsx}` | LEX-2.10: creado. Hook de foco al primer campo inválido + 3 casos jsdom. |
| `src/shared/presentation/components/form-error.tsx` | LEX-2.10: creado. Región `role="alert"` con `id` estable. |
| `src/shared/presentation/components/form-status.tsx` | LEX-2.10: creado. Pantalla de éxito `role="status"` que toma el foco al montarse. |
| `src/shared/presentation/components/index.ts` | LEX-2.10: exporta `FormError` y `FormStatus`. |
| `src/app/[locale]/(auth)/{login,signup,forgot-password,reset-password}/*-form.tsx` | LEX-2.10: `FormError` + `aria-describedby` + `useFocusFirstInvalid`; éxito vía `FormStatus` en los tres que tienen pantalla de éxito. |
| `src/app/[locale]/(app)/onboarding/onboarding-form.tsx` | LEX-2.10: `FormError` + hook; grupos de radio inválidos con `aria-invalid` + `tabIndex={-1}` + `<legend>` en rojo (deuda de LEX-2.8). |
| `tests/unit/messages/parity.test.ts` | LEX-2.10: creado. Candado de paridad ES/EN, árbol completo, dos direcciones. |
| `tests/e2e/identity-a11y.spec.ts` | LEX-2.10: creado. Foco al primer error en login y onboarding. |
| `tests/e2e/auth.spec.ts` | LEX-2.10: 1 aserción — `role="alert"` pasó del `<p>` al contenedor `#login-error`. LEX-2.11: usa `helpers.ts`. |
| `docs/evidence/LEX-2.10.md` | Creado. |
| `tests/e2e/helpers.ts` | LEX-2.11: creado. `PASSWORD`, `uniqueEmail`, `signUp` (con reintento de preparación), `completeOnboarding` — antes repetidos en cuatro specs. |
| `tests/e2e/isolation.spec.ts` | LEX-2.11: creado. Aislamiento A/B en la capa de interfaz (dos contextos simultáneos). |
| `tests/e2e/{protected,onboarding,identity-a11y}.spec.ts` | LEX-2.11: usan `helpers.ts`; ningún caso cambia de comportamiento. |
| `docs/evidence/LEX-2.11.md` | Creado. Auditoría de M2 (mapa criterio → evidencia). |

Migraciones SQL: **4** (`20260828143434_identity_and_course`, LEX-2.1;
`20260831162304_identity_and_course_rls`, LEX-2.3;
`20260831204649_onboarding_rpc`, LEX-2.7;
`20260831215553_active_course`, LEX-2.9). LEX-2.2, LEX-2.4…2.6 y LEX-2.8 no
añaden migración.

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

### Puertas de calidad — LEX-2.9 (2026-09-01, PR #16, ya en `main`)

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 12 ficheros/79, build)
pnpm db:reset  4 migraciones + seed desde vacío
pnpm db:test   000 · 010 · 020 · 030 · 040 · 050 · 060 · 070 — All tests successful, 123 asserciones
pnpm e2e       36 passed (flake de GoTrue en auth.spec `movil-poco-f5` en la 1ª pasada; 8/8 al repetir el spec, 36/36 el conjunto)
pnpm db:types  regenerado: profiles.active_course_id (Row/Insert/Update + FK), mismo commit
```

### Puertas de calidad — LEX-2.8 (PR #14, ya en `main`)

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 11 ficheros/75, build)
pnpm db:test   000 · 010 · 020 · 030 · 040 · 050 · 060 — All tests successful, 115 asserciones
pnpm e2e       36 passed (14 portada + 8 auth + 6 puerta + 8 onboarding)
pnpm db:types  sin cambios (LEX-2.8 no toca esquema)
```

### Puertas de calidad — LEX-2.7 (rama `feat/lex-2-7-onboarding`, ya en `main`)

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 10 ficheros/72, build)
pnpm db:reset  3 migraciones + seed desde vacío
pnpm db:test   000 · 010 · 020 · 030 · 040 · 050 · 060 — All tests successful, 115 asserciones
pnpm e2e       28 passed (14 portada + 8 auth + 6 puerta)
pnpm db:types  regenerado: Functions.complete_onboarding (Args tipados + Returns string)
```

Ida y vuelta real por PostgREST: `POST /rest/v1/rpc/complete_onboarding` con
token de sesión → `HTTP 200` + uuid; segunda llamada → mismo uuid, valores
nuevos aplicados.

### CI

```text
run 33658253752   CI   main   push          success   merge de PR #22 (LEX-3.1)
run 33657579290   CI   feat/lex-3-1-…       pull_request   success   PR #22 (LEX-3.1; job BD reintentado, infra)
run 33655823478   CI   main   push          success   merge de PR #21 (cierre docs LEX-2.11 / M2)
run 33654786410   CI   main   push          success   merge de PR #20 (LEX-2.11, cierra M2)
run 33654445913   CI   feat/lex-2-11-…      pull_request   success   PR #20 (LEX-2.11)
run 33652080651   CI   main   push          success   merge de PR #19 (cierre docs LEX-2.10)
run 33650912529   CI   main   push          success   merge de PR #18 (LEX-2.10)
run 33650503266   CI   feat/lex-2-10-…      pull_request   success   PR #18 (LEX-2.10)
run 33446280224   CI   main   push          success   merge de PR #17 (cierre docs LEX-2.9)
run 33445695615   CI   main   push          success   merge de PR #16 (LEX-2.9)
run 33445445077   CI   feat/lex-2-9-…       pull_request   success   PR #16 (LEX-2.9)
run 33443403540   CI   main   push          success   merge de PR #15 (cierre docs LEX-2.8)
run 33442806409   CI   main   push          success   merge de PR #14 (LEX-2.8)
run 33442548467   CI   feat/lex-2-8-…       pull_request   success   PR #14 (LEX-2.8)
run 33440461002   CI   main   push          success   merge de PR #13 (LEX-2.7)
```

LEX-2.1…2.11 y LEX-3.1 en `main` (`426b2b3`), CI verde en el PR y en el merge de
cada tarea.

---

## Verificaciones manuales pendientes

Corresponden a Joan:

1. **Confirmar la interpretación de «curso de referencia» en LEX-2.2:** se ha
   entregado como definición documentada, no como fila sembrada en `courses`.
   Ver `evidence/LEX-2.2.md` §1.
2. Mantener una copia de seguridad de `docs/no_visible_en_github/` fuera del
   proyecto: Git no protege esos archivos.
3. **LEX-2.5 — enlaces de correo de principio a fin (Mailpit
   `http://127.0.0.1:54324`):** (a) con `enable_confirmations` activado, que el
   enlace de confirmación de alta pase por `/api/auth/callback` y deje entrar;
   (b) recuperación de contraseña: solicitar → abrir el correo → seguir el
   enlace → cambiar la contraseña → entrar con la nueva. En local
   `enable_confirmations = false`, así que (a) no se puede probar sin cambiar la
   config.

---

## Bloqueos y preguntas

| ID | Asunto | Estado |
|---|---|---|
| Q-001 | Visibilidad de `CLAUDE.md` | `RESUELTA` — público |
| Q-002 | Qué documentación es pública | `RESUELTA` — privado el diseño, público el método |
| Q-003 | Herramientas de desarrollo | `RESUELTA` |
| Q-004 | Primer push al remoto público | `RESUELTA` |
| Q-005 | «Profesional» en un mazo: ¿nivel o categoría? | `ABIERTA` — recomendación: categoría (afecta a LEX-3.2/3.5) |

Abierta: **Q-005**. LEX-3.1 se entrega con la recomendación (categoría)
declarada; no bloquea LEX-3.1, sí condiciona el enum de `decks.cefr_level` en
LEX-3.2.

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
- **LEX-2.3…2.9 sin revisión cruzada independiente** (§3.6: políticas RLS,
  ADR-005, sesión SSR, redirects, `complete_onboarding`, la pantalla de
  onboarding, la FK compuesta del curso activo). No hay segundo agente. Deuda
  visible. `complete_onboarding` es SECURITY INVOKER (no DEFINER); el curso
  activo es una FK, no una función.
- **La puerta de onboarding sigue en `(app)/app/page.tsx` (y en
  `onboarding/page.tsx`), no centralizada.** Subirla al layout necesita el
  `pathname` para no crear un bucle con `/onboarding`, y un layout de Server
  Component no lo tiene a mano. `(app)` tiene dos rutas; se centraliza cuando
  tenga más.
- **Selector de curso sin interfaz (LEX-2.9).** `profiles.active_course_id` se
  persiste y la escritura está protegida por FK compuesta (probada en `070`);
  el cambio entre cursos llega con el segundo curso.
- **Panel «Hoy» (§9.4) pendiente** de mazos y planificador (FASE 3+). El shell
  de LEX-2.9 muestra el curso activo y un hueco descrito.
- **Sin herramienta automática de a11y (axe / `jsx-a11y`) en el gate (LEX-2.10).**
  No está instalada; añadirla es una decisión de stack fuera del alcance. La
  verificación es RTL para el foco + revisión manual de roles y `aria-*`. Deuda
  para una tarea de tooling.
- **`aria-invalid` en `<fieldset>` (LEX-2.10)** no tiene soporte uniforme en
  todos los lectores; el color de la `<legend>` y el `role="alert"` que enumera
  las pegas son el respaldo.

---

## Siguiente acción exacta

Empezar **LEX-3.2** — migraciones de `decks`, `concepts`, `deck_concepts`,
`practice_items`, `tags`, `concept_tags`. Fuente `MASTER_SPEC.md` §§13.6–13.10;
gate de migraciones (§12.3). Enums de PostgreSQL / CHECK para `deck.category`,
`concept.kind`, `practice_item.mode` (los 7, 3 activables); `practice_items.config`
JSONB discriminado por `mode`; `archived_at` para el contenido con historial;
`deck_concepts` con `unique (deck_id, concept_id)`; límites ≥ los de
`library/domain/taxonomy.ts`; `database.types.ts` regenerado en el mismo commit;
`DATA_MODEL.md` y diagrama al día. **Antes de fijar `decks.cefr_level`, resolver
o confirmar Q-005** (recomendación: `professional` es categoría, no nivel, y
`decks.cefr_level` reutiliza `public.cefr_level`). Rama `feat/lex-3-2-…` desde
`main` (`426b2b3`).

Acción pendiente del propietario: **decidir Q-005**; **etiqueta de hito M2**
(`v0.3.0-m2` o la que Joan decida) — no se crea sin autorización expresa
(CLAUDE.md §4).

Decisiones vivas: `force row level security` **no** activado (LEX-2.3); creación
de perfil = caso de uso, **no** trigger (ADR-005); errores de autenticación con
clave estable + traducción en presentación (LEX-2.5); área privada con doble
barrera —proxy + layout de `(app)`— y `next` en poder del proxy (LEX-2.6);
operaciones atómicas en función SQL SECURITY INVOKER tras un puerto, idioma de
apoyo/objetivo fijos en la V1 (LEX-2.7); puerta de onboarding por página en
`(app)` hasta que exista el shell (LEX-2.8); curso activo por FK compuesta
`(active_course_id, id) → courses (id, owner_id)`, `on delete set null` con
lista de columnas (LEX-2.9).

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

- Rama por defecto: `main` en `426b2b3` (PR #22, LEX-3.1).
  Etiquetas `v0.1.0-m0` y `v0.2.0-m1` publicadas; `v0.3.0-m2` **pendiente de
  autorización de Joan**.
- Sin rama de trabajo activa.
- LEX-1.14 → PR #3; LEX-2.1 → PR #4 (+ #5 docs); LEX-2.2 → PR #6 (+ #7 docs);
  LEX-2.3 → PR #8 (+ #9 cierre docs); LEX-2.4 → PR #10; LEX-2.5 → PR #11;
  LEX-2.6 → PR #12; LEX-2.7 → PR #13; LEX-2.8 → PR #14 (+ #15 cierre docs);
  LEX-2.9 → PR #16 (+ #17 cierre docs); LEX-2.10 → PR #18 (+ #19 cierre docs);
  LEX-2.11 → PR #20 (+ #21 cierre docs); LEX-3.1 → PR #22.
  Ramas borradas.
- Contenido versionado: aplicación Next.js completa (módulos `identity` y
  `courses`), `supabase/` (config, seed, tests, **migrations** — cuatro:
  `…_identity_and_course`, `…_identity_and_course_rls`, `…_onboarding_rpc`,
  `20260831215553_active_course`), CI, documentación en `docs/` y ADR (001–005).
