# LEX-2.4 — Creación idempotente de perfil

**Fecha:** 2026-08-31
**Rama:** `feat/lex-2-4-profile-creation`
**Estado resultante:** `HECHO`

---

## 1. Alcance

Mecanismo que garantiza que existe la fila `public.profiles` del usuario
autenticado, de forma idempotente, y su prueba. **No** incluye invocarlo desde
una ruta (LEX-2.6/2.9), leer el perfil, ni los campos de onboarding (LEX-2.7/2.8).

## 2. Decisión: caso de uso, no trigger — ADR-005

`MASTER_SPEC.md` §9.2 pide «creación automática e idempotente del perfil». Dos
formas: trigger `SECURITY DEFINER` sobre `auth.users`, o caso de uso de
aplicación. Se elige el **caso de uso**:

- Alinea con ADR-001/-002: el arranque de identidad vive en la capa de
  aplicación, tras un puerto, y se prueba sin base de datos.
- Evita añadir una función `SECURITY DEFINER` sin la revisión cruzada que
  `ROADMAP.md` §3.6 exige para esa categoría y que ahora no está disponible.
- La política `profiles_insert_own` (LEX-2.3) ya habilita el `insert` propio y
  hace de segunda barrera.
- `MASTER_SPEC.md` línea 1093 sienta el precedente de decidir esto en un ADR.

**Sin migración:** la unicidad la da la PK de `profiles` (LEX-2.1); la
idempotencia, `INSERT ... ON CONFLICT (id) DO NOTHING`.

Riesgo aceptado (ADR-005 §Consecuencias): ventana entre el alta en `auth.users`
y la primera petición de servidor propia sin perfil. En la V1 todos los caminos
a contenido autenticado pasan por servidor nuestro; la garantía la cierra
LEX-2.6.

## 3. Implementación

| Archivo | Capa | Contenido |
|---|---|---|
| `src/modules/identity/application/ensure-profile.ts` | aplicación | Puerto `ProfileRepository.ensureExists`, caso de uso `ensureProfile` (valida id no vacío, delega), `EnsureProfileError`. Tipo `EnsureProfileOutcome = "created" \| "already-existed"`. |
| `src/modules/identity/infrastructure/supabase-profile-repository.ts` | infraestructura | `upsert({id}, { onConflict:"id", ignoreDuplicates:true }).select("id")`. `data.length > 0` → `created`. Traduce el error de PostgREST a `EnsureProfileError`. |
| `src/composition/identity.ts` | composición | `ensureProfileForCurrentUser()`: `userId` desde `getClaims()` (firma verificada), nunca de un parámetro; sin sesión → `null`. |

Sin carpeta `domain/` en el módulo: no hay lógica pura que colocar
(`src/modules/README.md` lo permite para un módulo trivial).

## 4. Comportamiento de `ON CONFLICT` verificado contra el stack local

```text
insert ... on conflict (id) do nothing returning id   -- fila nueva → 1 row
insert ... on conflict (id) do nothing returning id   -- ya existía → 0 rows
insert ... (sin on conflict, id duplicado)            -- ERROR 23505 profiles_pkey
```

De ahí sale `created` / `already-existed` en el adaptador.

## 5. Tests

### Aplicación — `ensure-profile.test.ts` (repositorio en memoria)

- crea a la primera (`created`, 1 fila);
- idempotente: repetir → `already-existed`, sigue 1 fila;
- dos llamadas concurrentes (`Promise.all`) → exactamente un `created`;
- identificador vacío → `EnsureProfileError`, no toca el repositorio;
- fallo del repositorio → se propaga como `EnsureProfileError`.

### Base de datos — `050-profile-creation.sql` (9 asserciones)

Autocontenido, como `040`. Como `authenticated` con `auth.uid()` fijado:

- `auth.uid()` resuelve a A;
- primer `ensure` inserta 1 fila; A tiene exactamente 1; `ui_locale` por defecto `es`;
- segundo `ensure` inserta 0 (idempotente); sigue habiendo 1;
- **insert duplicado a pelo → `23505`** — es la PK la que hace el perfil no
  duplicable, no la cláusula `ON CONFLICT`;
- A no puede crear el perfil de B → `42501` (`profiles_insert_own`);
- `anon` no puede crear perfiles → `42501`.

```text
pnpm db:test
  000 · 010 · 020 · 030 · 040 · 050 — All tests successful, Files=6, Tests=83
```

### Verificación por rotura

En una transacción `rollback` contra el stack local: `alter table
public.profiles drop constraint profiles_pkey cascade`; los dos `insert` a pelo
del mismo id pasan a dejar **2 filas**. Confirma que la asserción `23505` de
`050` es la que discrimina: sin la PK, deja de fallar. (No se toca la migración;
la PK cascada a `courses_owner_id_fkey`, de ahí que la demostración sea
ad-hoc y revertida.)

Las asserciones `42501` replican el patrón ya verificado por rotura en `040`
(LEX-2.3): debilitar la política de inserción hace que dejen de fallar.

## 6. Verificación general

```text
pnpm db:test    6 ficheros, 83 asserciones, PASS
pnpm check      exit 0 (format, lint, typecheck, contraste 18/18, vitest 4 ficheros/22, build)
pnpm e2e        14 passed (escritorio-chromium + movil-poco-f5)
```

La regla de capas de ESLint pasa: `application/` no importa `@supabase/*` ni
infraestructura; el adaptador vive en `infrastructure/`.

## 7. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/identity/application/ensure-profile.ts` | Nuevo. |
| `src/modules/identity/application/ensure-profile.test.ts` | Nuevo. |
| `src/modules/identity/infrastructure/supabase-profile-repository.ts` | Nuevo. |
| `src/composition/identity.ts` | Nuevo. |
| `supabase/tests/database/050-profile-creation.sql` | Nuevo. 9 asserciones. |
| `docs/adrs/ADR-005-creacion-de-perfil.md` | Nuevo. |
| `docs/adrs/README.md` | Fila de ADR-005 en el índice. |
| `docs/DATA_MODEL.md` | Nota sobre la creación de la fila de perfil. |
| `docs/evidence/LEX-2.4.md` | Nuevo. |

Migraciones añadidas: **ninguna** (ADR-005: sin trigger, sin cambio de esquema).

## 8. Riesgos y deuda

- La ventana sin perfil (ADR-005 §Consecuencias): se cierra en LEX-2.6.
- `ensureProfileForCurrentUser()` no tiene todavía ningún llamador: es el punto
  de entrada que consumirán LEX-2.5 (tras el alta) y LEX-2.6 (protección de
  rutas).
- ADR-005 no ha recibido revisión cruzada independiente (§3.6, funciones
  `security definer` / RLS): no hay segundo agente. Al elegir *no* añadir una
  función `SECURITY DEFINER`, la superficie que esa revisión cubriría no crece.

## 9. Estado del árbol Git

Rama `feat/lex-2-4-profile-creation` desde `main` (`b44b5bb`). Pendiente de
commit, PR y CI.

## 10. Siguiente tarea

**LEX-2.5** — registro, verificación, login, logout y recuperación por correo y
contraseña. Depende de LEX-1.8 y LEX-2.4 (`HECHO`). No se inicia aquí.
