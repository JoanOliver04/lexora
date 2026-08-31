# LEX-2.8 — Construir onboarding ES/EN

**Fecha:** 2026-08-31
**Rama:** `feat/lex-2-8-onboarding-ui`
**Estado resultante:** `HECHO`

---

## 1. Alcance

Pantalla de onboarding sobre `completeOnboardingForCurrentUser` (LEX-2.7).
Flujo corto de `MASTER_SPEC.md` §9.3, en ES y EN, con estado de error y
reintento, campos nativos para teclado y móvil, recomendación visible de 5
ítems nuevos diarios y la aclaración de que el nivel declarado no certifica
dominio ni bloquea contenido.

**Sin migración.** El manejo fino de estados (loading/empty/success) y la
auditoría de accesibilidad son LEX-2.10; aquí se entrega el error del
formulario y los controles nativos.

## 2. Ruta `src/app/[locale]/(app)/onboarding/`

| Archivo | Papel |
|---|---|
| `page.tsx` | Server Component. `setRequestLocale`; si `hasCompletedOnboardingForCurrentUser()` es `true`, `redirect(/{locale}/app)` —no hay nada que hacer aquí—. Pinta el marco y el formulario. |
| `onboarding-form.tsx` | Cliente. `useActionState` sobre la Server Action. Radios para idioma de interfaz, nivel declarado y nivel de inicio; `type="number"` para el límite. Idiomas de apoyo/objetivo como texto fijo confirmado. Errores: bloque `role="alert"` que enumera **todas** las pegas traducidas; `aria-invalid` solo en el campo de número (donde el `Input` pinta el borde de error). El resaltado de los grupos de radio inválidos es LEX-2.10. |
| `actions.ts` | Server Action delgada (ADR-001). Construye la selección cruda del formulario y llama a la composición. `uiLocale` y `locale` se validan contra `routing.locales` antes de entrar en `redirect()`. En éxito: `redirect(/{uiLocale}/app)`. |

De los 7 pasos de §9.3, 4 son entrada real (interfaz, nivel declarado, nivel de
inicio, límite); los pasos 2–3 son «confirmar» (apoyo español, objetivo inglés
`en-GB`, fijos en la V1); el paso 7 es la operación. Los mazos base vacíos del
paso 7 quedan fuera (`decks` es FASE 3, ya declarado en LEX-2.7).

**Redirección a `/{uiLocale}/app`:** la app aparece en el idioma que la persona
acaba de elegir. Es hoy el único punto que lee `profiles.ui_locale`; el resto
de la interfaz aún se guía por el segmento de la URL.

**Campo de número vacío.** `Number("")` es `0`, que está dentro de `0..100`: un
campo borrado pasaría como «0 ítems nuevos» sin avisar. `parseDailyNewLimit`
fuerza el vacío a `NaN` para que el dominio lo rechace con
`onboarding.dailyNewLimit.notInteger`. `Number("5.5")` → `5.5` → mismo rechazo;
`Number("abc")` → `NaN` → rechazo.

## 3. Puerta de onboarding

Dos comprobaciones, una por página, sin bucle:

- `(app)/app/page.tsx`: si `!hasCompletedOnboardingForCurrentUser()` →
  `redirect(/{locale}/onboarding)`.
- `onboarding/page.tsx`: si ya está → `redirect(/{locale}/app)`.

`(app)/layout.tsx` no cambia: no puede alojar el «manda a onboarding» porque
envuelve también la propia pantalla de onboarding. Cuando LEX-2.9/2.10
construyan el shell real, esta comprobación sube a un punto único (anotado como
deuda en `STATUS.md`).

`PROTECTED_SEGMENTS` de `protected-paths.ts` pasa de `["app"]` a
`["app", "onboarding"]`: el `(app)/layout` ya negaba el acceso, pero sin esto
el proxy (LEX-2.6) no tocaba `/{locale}/onboarding` y se perdían la
conservación de `?next=` y el `Cache-Control: private, no-store`. Test
ampliado: `/es/onboarding` → `true`, `/es/onboardingx` → `false`.

## 4. Estado de onboarding

`identity` es dueño de `profiles` (`ARCHITECTURE.md` §Módulos), así que el
lector vive ahí:

- `ProfileRepository.hasCompletedOnboarding(userId): Promise<boolean>` — nuevo
  método del puerto (LEX-2.4).
- Adaptador: `select onboarding_completed_at … .maybeSingle()`. Sin fila (perfil
  aún no asegurado) → `data: null` sin lanzar → `false`. `profiles_select_own`
  (LEX-2.3) cubre la lectura.
- Composición: `hasCompletedOnboardingForCurrentUser()` en
  `src/composition/onboarding.ts` — `userId` de `getClaims()`, sin sesión →
  `false`.

Los dos dobles en memoria de `ensure-profile.test.ts` implementan el método
nuevo (uno con un `Set` de onboarded, el otro devuelve `false`).

## 5. i18n

Namespace `Onboarding` en `messages/{es,en}.json`: título, intro, etiquetas y
pistas de cada campo, nombres de nivel, `declaredLevelNote`, `submit` /
`submitting`, `genericError` y `errors.*`.

Las claves de `errors` usan `_` y no `.` (`dailyNewLimit_outOfRange`) porque
next-intl interpreta el punto como anidamiento. El formulario transforma la
clave de dominio (`onboarding.dailyNewLimit.outOfRange`) a la clave de mensaje.

## 6. Tests

### Unitarios (`pnpm test` → 11 ficheros, 75 tests, PASS)

- `protected-paths.test.ts` (+1 caso): `/es/onboarding` y `/en/onboarding` →
  `true`; `/es/onboardingx` → `false`.
- `tests/unit/messages/onboarding-error-keys.test.ts` (nuevo, 2): `issueMessageKey`
  transforma la clave de dominio a la plana; **cada `OnboardingIssue` tiene
  mensaje en `es` y en `en`** (la lista se fija con `satisfies readonly
  OnboardingIssue[]`, así que no puede desviarse de la unión).
- `ensure-profile.test.ts`: los dobles cumplen el puerto ampliado (sin caso
  nuevo: `ensureProfile` no llama al método nuevo).

### Extremo a extremo — `tests/e2e/onboarding.spec.ts` (4 × 2 dispositivos)

- **Puerta y vuelta:** alta → `/es/app` rebota a `/es/onboarding` (título
  «Prepara tu curso», visible la aclaración «no certifica tu dominio ni bloquea
  contenido»); elegir nivel B1, enviar → `/es/app` («Área privada»); volver a
  `/es/onboarding` → redirige a `/es/app`.
- **`/en/onboarding`:** alta → `goto("/en/onboarding")` → encabezado «Set up
  your course» y la aclaración en inglés visibles. Cubre el namespace
  `Onboarding` de `en.json` completo.
- **Idioma de interfaz:** en `/es/onboarding`, elegir «English» y nivel A2 →
  aterriza en `/en/app` con el encabezado «Your space». Es la prueba de que
  `profiles.ui_locale` se guarda y dirige la redirección.
- **Error de rango:** límite `150` → sigue en `/es/onboarding`, mensaje «Los
  ítems nuevos por día deben estar entre 0 y 100.» visible, `aria-invalid="true"`
  en el campo; después `goto("/es/app")` **vuelve a rebotar** a `/es/onboarding`
  → el curso no se creó (el rechazo ocurrió antes del repositorio).

### Test existente ajustado

`protected.spec.ts` («tras entrar se llega al destino guardado; al salir se
cierra otra vez») ahora completa el onboarding una vez tras el alta, mediante un
helper `completeOnboarding(page)`. Sin ese paso, la nueva puerta rebotaría
`/es/app` a `/es/onboarding` y el `toHaveURL("/es/app")` fallaría. Es
consecuencia directa de LEX-2.8, no un flake; el helper elige el nivel
declarado dentro del `<fieldset>` correcto (`getByRole("group", …)`) para no
chocar con los radios de mismo texto del otro grupo.

## 7. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 11 ficheros/75, build)
pnpm db:test   7 ficheros / 115 asserciones, PASS (sin cambios: LEX-2.8 no toca esquema)
pnpm e2e       36 passed (14 portada + 8 auth + 6 puerta + 8 onboarding)  — verde a la primera
pnpm db:types  sin cambios
```

## 8. Archivos

| Archivo | Cambio |
|---|---|
| `src/app/[locale]/(app)/onboarding/page.tsx` | Nuevo. Server Component + puerta «ya onboardado → /app». |
| `src/app/[locale]/(app)/onboarding/onboarding-form.tsx` | Nuevo. Formulario cliente, `useActionState`, estado de error. |
| `src/app/[locale]/(app)/onboarding/actions.ts` | Nuevo. Server Action delgada. |
| `src/app/[locale]/(app)/app/page.tsx` | Puerta: «sin onboarding → /onboarding». |
| `src/modules/identity/application/ensure-profile.ts` (+ `.test.ts`) | `ProfileRepository.hasCompletedOnboarding`; dobles actualizados. |
| `src/modules/identity/infrastructure/supabase-profile-repository.ts` | Implementa `hasCompletedOnboarding` (`maybeSingle`). |
| `src/modules/identity/application/protected-paths.ts` (+ `.test.ts`) | `onboarding` en `PROTECTED_SEGMENTS`. |
| `src/composition/onboarding.ts` | `hasCompletedOnboardingForCurrentUser`. |
| `src/app/[locale]/(app)/onboarding/message-key.ts` (+ `tests/unit/messages/onboarding-error-keys.test.ts`) | Nuevo. `issueMessageKey` + test de cobertura de mensajes. |
| `messages/{es,en}.json` | Namespace `Onboarding`. |
| `tests/e2e/onboarding.spec.ts` | Nuevo. 4 casos × 2 dispositivos. |
| `tests/e2e/protected.spec.ts` | El test del destino guardado completa el onboarding tras el alta. |
| `docs/STATUS.md`, `docs/evidence/LEX-2.8.md` | Este informe y la sincronización de estado. |

Migraciones: **ninguna**.

## 9. Riesgos y deuda

- **La puerta de onboarding está repetida por página** (hoy solo una). Sube a un
  punto único cuando LEX-2.9/2.10 construyan el shell.
- **Manejo fino de estados y auditoría de accesibilidad: LEX-2.10.** Aquí:
  error del formulario + campos nativos.
- **Sin revisión cruzada independiente** (§3.6, UX del flujo). No hay segundo
  agente. Deuda visible.
- **`ui_locale` solo influye en la redirección final.** El resto de la interfaz
  se guía por el segmento de URL; unificar ambos es trabajo de fases de
  identidad posteriores.

## 10. Estado del árbol Git

Rama `feat/lex-2-8-onboarding-ui` desde `main` (`0cfdc70`). PR #14 fusionada a
`main` (merge `ce72ff9`); CI verde en los tres trabajos, runs `33442548467`
(PR) y `33442806409` (merge). Rama borrada.

## 11. Siguiente tarea

**LEX-2.9** — shell autenticado y selector de curso activo: home privada
asociada al curso, curso activo persistido, cambio que no da acceso a un UUID
ajeno. Depende de LEX-2.8. No se inicia aquí.
