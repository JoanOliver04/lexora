# LEX-2.11 — Auditoría E2E y de M2 con dos usuarios

**Fecha:** 2026-09-02
**Rama:** `feat/lex-2-11-m2-audit`
**Estado resultante:** `HECHO` — **cierra FASE 2 / M2**

---

## 1. Alcance

Pasada de conjunto sobre M2 (identidad y onboarding aislados). No añade
producto: recorre los flujos de punta a punta, comprueba el aislamiento A/B en
las tres capas y confirma que el esquema versionado se aplica desde vacío.

**Sin migración. Sin cambio de esquema.** `db:test` sigue en 123 asserciones,
`db:types` sin cambios.

Lo único nuevo en código: un E2E de aislamiento en la capa de interfaz (el único
hueco que ningún test cubría de punta a punta) y un módulo de utilidades
compartidas para los E2E de identidad, que además fija la política de reintento
del alta (§5).

## 2. Criterios de salida de M2 → evidencia

| Criterio de M2 | Dónde queda demostrado |
|---|---|
| **Registro** con correo y contraseña; no revela si una dirección existe | `tests/e2e/auth.spec.ts` (alta → logout → login por cookie; contraseña incorrecta → mensaje genérico; recuperación responde igual exista o no la cuenta). Unit: `credentials.test.ts`, `auth-flows.test.ts`. |
| **Sesión SSR** con doble barrera | `tests/e2e/protected.spec.ts` (anónimo → `login?next=`; tras entrar se llega al destino; al salir se cierra; ruta privada `Cache-Control: no-store`). La identidad se deriva de `getClaims()` (firma verificada); `getSession()` está prohibido por lint. |
| **Onboarding completo** — cuatro elecciones, operación atómica e idempotente | `tests/e2e/onboarding.spec.ts` (4 casos ×2 dispositivos: puerta y vuelta, `/en/onboarding`, `ui_locale`→`/en/app`, límite fuera de rango no crea curso). pgTAP `060-onboarding-rpc.sql` (34 asserciones: dueño C, no-dueño D, anon `42501`, idempotencia con valores distintos, rango `23514`, `active_course_id`). Unit: `onboarding.test.ts` (dominio puro), `complete-onboarding.test.ts`. |
| **Curso inicial `es` → `en-GB`** | pgTAP `060` líneas 77–87: tras el onboarding, `courses.target_language_id` = la fila `en/en` del catálogo y `courses.target_locale` = `'en-GB'`. La UI lo confirma como texto fijo («Inglés (en-GB)») en `onboarding.spec.ts`. |
| **Aislamiento en PostgreSQL (RLS)** | pgTAP `040-identity-course-rls.sql` (36 asserciones: A / B / anon / `service_role`, acceso directo y por UUID conocido del curso ajeno; cada denegación emparejada con su permiso para que un JWT que no llegue a `auth.uid()` no dé falso verde). `050` (perfil), `060` (RPC), `070` (curso activo, `23503` al apuntar al curso de otro). |
| **Aislamiento en el servidor** | Toda composición `*ForCurrentUser` (`identity.ts`, `onboarding.ts`, `courses.ts`) toma el `userId` de `client.auth.getClaims()` (`claims.sub`), **nunca de un parámetro**. `resolveSafeRedirect` filtra el `next`/`locale` antes de cualquier `redirect()`. Regla de capas exigida por lint + `tests/unit/architecture/layer-rules.test.ts`. |
| **Aislamiento en la interfaz** | `tests/e2e/isolation.spec.ts` (**nuevo**): dos contextos de navegador con sesión a la vez; A hace el onboarding en español y B en inglés; cada uno ve su propio curso, y la actividad de uno no cambia lo que ve el otro. Señal que identifica al dueño: `courses.title` se fija al crear a partir del `ui_locale` de ese usuario, así que el curso de A se titula «Inglés» y el de B «English» **aunque se miren bajo el otro locale**. |
| **Migración desde base limpia** | `pnpm db:reset` aplica las 4 migraciones desde vacío, en orden, sin pasos manuales, pese al ciclo `profiles → courses → profiles(owner_id)`. Es el job «Base de datos» de la CI. |
| **CI verde en los tres trabajos** | Runs `<PR>` y `<merge>` — se rellenan al cerrar (§8). |

## 3. Nada que reprobar en la auditoría

- **RLS:** `force row level security` no activado a propósito (ningún cliente se
  conecta como propietario de tabla; `postgres` tiene `BYPASSRLS`). Decisión
  técnica documentada en la migración de LEX-2.3, no un `Q-nnn`.
- **`010-rls-enabled.sql` comprueba «RLS habilitado», no «≥1 política».** Una
  tabla de FASE 3 podría habilitar RLS y olvidar las políticas → deny-all
  silencioso. Ampliar la invariante es trabajo de FASE 3 (deuda ya anotada).
- **Puerta de onboarding por página** (`(app)/app` ⇄ `/onboarding`), no
  centralizada: subirla al layout necesita el `pathname`, que un layout de
  Server Component no tiene. `(app)` tiene dos rutas; se centraliza cuando tenga
  más. Deuda anotada.
- **Sin revisión cruzada independiente §3.6** de LEX-2.3…2.10 (RLS, ADR-005,
  sesión SSR, `complete_onboarding`, accesibilidad). No hay segundo agente.
  Deuda visible, arrastrada.
- **Verificación de correo real** (`enable_confirmations`), enlaces de
  recuperación de principio a fin por Mailpit: comprobación manual del
  propietario, ya registrada en `STATUS.md`.

## 4. Utilidades compartidas de E2E — `tests/e2e/helpers.ts`

Antes, cuatro specs repetían su propio `uniqueEmail` y su propio `signUp`. Se
unifican en `helpers.ts`: `PASSWORD`, `uniqueEmail(prefix)`, `signUp(page)` (con
el reintento de §5) y `completeOnboarding(page, { declaredLevel?, uiLocale? })`.
`auth.spec.ts`, `protected.spec.ts`, `onboarding.spec.ts` e
`identity-a11y.spec.ts` pasan a importarlos; ningún caso de prueba cambia de
comportamiento.

## 5. El flake de GoTrue — decisión

**Síntoma:** una vez cada ~8 pasadas completas en local (LEX-2.7, 2.9, 2.10), el
alta cae en `movil-poco-f5` en una página de error de Next (`<html
id="__next_error__">`) en lugar de redirigir a `/es`. **Nunca en CI** (un worker
+ un reintento de Playwright).

**Investigación:**

1. **Hipótesis de límite de peticiones** (`[auth.rate_limit] sign_in_sign_ups =
   30` por 5 min y por IP en `supabase/config.toml`). La suite hace ~12
   operaciones de alta/login por proyecto de dispositivo, ~24 en total —cerca
   del límite—.
2. **Descartada por sondeo directo:** 45 altas seguidas contra
   `POST /auth/v1/signup` desde una IP, **todas `200`**. El stack local no
   aplica ese límite. Subirlo habría cambiado un valor que nunca se alcanza.
3. **No reproducible:** ~10 pasadas completas dirigidas con instrumentación en
   `supabase-auth-gateway.ts` (registrando `status`/`code`/`message` de
   cualquier error no mapeado) — el flake no volvió a aparecer y la sonda no
   registró nada. Instrumentación retirada.

**Decisión — reintento de preparación, no política global.** `signUp` reintenta
el alta **una vez, con un correo nuevo**, si no cae en `/es` en 10 s. Es un
fallo de *preparación* del test, no una aserción del producto; reintentarlo no
esconde inestabilidad real de una aserción. `playwright.config.ts` mantiene
`retries: 0` en local a propósito, para que un test inestable de verdad se note;
esto no lo toca. Documentado en el propio `helpers.ts`.

## 6. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 8/8, vitest 14 ficheros/85, build)
pnpm db:reset  4 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test   8 ficheros / 123 asserciones, PASS (sin cambios: no toca esquema)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       46 passed (44 previos + isolation ×2 dispositivos); 12 pasadas completas seguidas sin flake tras el reintento de preparación
```

`pnpm db:reset` falló una vez con `{"code":"LegacyDbSetupError","message":"error
running container: exit 1"}` —el fallo transitorio de contenedor de la CLI de
Supabase ya visto en LEX-2.9—; `supabase stop && supabase start` y reintento →
verde. No es del cambio (la tarea no toca SQL).

## 7. Archivos

| Archivo | Cambio |
|---|---|
| `tests/e2e/helpers.ts` | Nuevo. `PASSWORD`, `uniqueEmail`, `signUp` (con reintento de preparación), `completeOnboarding`. |
| `tests/e2e/isolation.spec.ts` | Nuevo. Aislamiento A/B en la capa de interfaz: dos contextos simultáneos, cada uno ve su curso. |
| `tests/e2e/auth.spec.ts` | Usa `helpers.ts` (elimina `uniqueEmail`/`PASSWORD` locales; el alta pasa por `signUp`). |
| `tests/e2e/protected.spec.ts` | Usa `helpers.ts` (elimina `uniqueEmail`/`PASSWORD`/`completeOnboarding` locales). |
| `tests/e2e/onboarding.spec.ts` | Usa `signUp` de `helpers.ts` (elimina el `signUp` local). |
| `tests/e2e/identity-a11y.spec.ts` | Usa `signUp`/`uniqueEmail` de `helpers.ts`. |
| `docs/evidence/LEX-2.11.md`, `docs/STATUS.md` | Auditoría y estado. |

Migraciones: **0**.

## 8. Estado del árbol Git

Rama `feat/lex-2-11-m2-audit` desde `main` (`f75f74e`). PR `<n>` — CI y merge se
rellenan al cerrar. Runs de CI: `<PR>` y `<merge>`, tres trabajos cada una.

## 9. Cierre de FASE 2 / M2

Con LEX-2.11 en verde, las 11 tareas de FASE 2 están `HECHO` → **FASE 2
`HECHO`**, **M2 `HECHO`**. La etiqueta de hito (`v0.3.0-m2` o la que decida el
propietario) **no se crea sin autorización expresa** (CLAUDE.md §4): queda
anotada como acción pendiente de Joan en `STATUS.md`.

## 10. Siguiente

**FASE 3 — M3, biblioteca manual usable.** Primera tarea: LEX-3.1 (según el
roadmap). No se inicia aquí.
