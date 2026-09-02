# LEX-2.10 — Completar manejo de estados y accesibilidad de identidad

**Fecha:** 2026-09-02
**Rama:** `feat/lex-2-10-identity-states` (PR #18, merge `4619dbe`)
**Estado resultante:** `HECHO`

---

## 1. Alcance

Pulido transversal de las vistas de identidad (`(auth)/`, `(app)/onboarding/`,
`(app)/app/`): los cuatro estados de cada formulario explícitos y consistentes,
foco y anuncios para lector de pantalla, y un candado mecánico sobre la
completitud de las traducciones ES/EN.

**No toca esquema.** Sin migración. `db:test` y `db:types` quedan igual.

### Los cuatro estados, vista por vista

| Estado | Cómo se resuelve |
|---|---|
| **Loading** | `PendingButton` en los cinco formularios (`login`, `signup`, `forgot-password`, `reset-password`, `onboarding`): `disabled` + `aria-busy` + cambio de etiqueta mientras el Server Action está en vuelo. Ya existía; se deja constancia de que cubre el estado. |
| **Error** | El trabajo de esta tarea. Región `role="alert"` con `id` estable (`FormError`), campos con `aria-invalid` **y** `aria-describedby` a esa región, y el foco al primer campo inválido en cada envío fallido (`useFocusFirstInvalid`). |
| **Success** | `signup` / `forgot-password` / `reset-password` sustituyen el formulario por `FormStatus`: `role="status"` (anuncio `polite`) con `tabIndex={-1}` que **toma el foco al montarse** —el `<form>` y el botón donde estaba el foco desaparecen del DOM, así que sin esto quien navega con teclado caería a `<body>`—. `login` y `onboarding` no tienen pantalla de éxito: hacen `redirect()` (a `/{locale}` y a `/{uiLocale}/app`). |
| **Empty** | No hay vistas de lista en identidad; los formularios siempre tienen campos. N/A, registrado. |

## 2. Foco y anuncios — `useFocusFirstInvalid`

`src/shared/presentation/hooks/use-focus-first-invalid.ts`. Hook de cliente:
tras cada envío mueve el foco al primer `[aria-invalid="true"]` del formulario.

- **Depende del objeto de estado de `useActionState`, no del código de error.**
  React crea un objeto nuevo en cada envío, así que el efecto se vuelve a
  ejecutar aunque el error se repita. Un `useEffect(…, [])` (solo montaje) o un
  `useEffect(…, [state.error])` no recolocarían el foco cuando el usuario lo ha
  movido y reenvía con el mismo error. La prueba que discrimina esto está en
  `use-focus-first-invalid.test.tsx` y en el e2e de login.
- **El foco va al campo, no al `role="alert"`.** El `alert` ya se anuncia solo
  al insertarse; llevar además el foco ahí duplicaría el anuncio y dejaría al
  usuario lejos de donde tiene que escribir. El campo apunta al `alert` con
  `aria-describedby`, así que al recibir el foco el lector lee la etiqueta y
  luego el motivo.
- **Grupos de radio del onboarding** (deuda que LEX-2.8 dejó anotada para
  aquí): un grupo inválido es un `<fieldset>` con `aria-invalid="true"`,
  `aria-describedby` a la región de error, `tabIndex={-1}` para poder recibir el
  foco, y la `<legend>` en color de error como pista visible. El detalle del
  mensaje sigue en el `role="alert"` que enumera todas las pegas.

### `FormError`

`src/shared/presentation/components/form-error.tsx`. Componente presentacional
(sin `"use client"`, sirve en RSC): `<div id role="alert">` con el estilo de
error. Da un `id` estable por formulario para poder referenciarlo desde
`aria-describedby`. Se exporta desde el barrel `components/index.ts`.

Los cinco formularios pasan a usarlo. El `role="alert"` deja de estar en el
`<p>` del mensaje y pasa al contenedor; el `id` por formulario es `login-error`,
`signup-error`, `forgot-error`, `reset-error`, `onboarding-error`.

### `FormStatus`

`src/shared/presentation/components/form-status.tsx`. `"use client"`:
`<div role="status" tabIndex={-1}>` que toma el foco al montarse
(`useEffect([], focus)`). Unifica las tres pantallas de éxito de identidad
—antes cada una era un `<div role="status">` hecho a mano— y cierra el hueco de
foco: al sustituir el formulario entero, el botón donde estaba el foco
desaparece y sin este componente el foco caería a `<body>`. `outline-none`
porque el contenedor no es un control, solo un destino de foco programático
fuera del orden de tabulación.

## 3. Traducciones — candado de paridad

`tests/unit/messages/parity.test.ts`. Camina el árbol **completo** de
`messages/es.json` y `messages/en.json` (no un `Object.keys` plano, que pasaría
con `Auth.login.submit` ausente) y afirma, en las dos direcciones:

- ninguna clave de `es` falta en `en` (si no, la pantalla en inglés
  renderizaría la clave cruda);
- `en` no tiene claves que `es` no tenga (mensaje muerto);
- todos los valores hoja son cadenas no vacías en los dos idiomas.

`onboarding-error-keys.test.ts` (de LEX-2.8) se mantiene: comprueba algo que la
paridad no ve —que la transformación `issueMessageKey` produce exactamente las
claves de la unión `OnboardingIssue`—.

**Verificación por rotura:** borrada `Auth.login.submit` de `en.json`, el test
falla con `+ [ "Auth.login.submit" ]`; restaurado, verde. El árbol de `es`/`en`
ya estaba en paridad antes del cambio: el candado protege que siga así.

## 4. Tests

### Unitarios (`pnpm test` → 14 ficheros, 85 tests, PASS)

- `use-focus-first-invalid.test.tsx` (nuevo, jsdom, 3 casos): sin campos
  inválidos no toca el foco; lleva el foco al primer inválido y **lo recoloca
  en cada envío** aunque el usuario lo haya movido y el error se repita (el caso
  que distingue este hook de un `useEffect` de montaje); tras un envío correcto
  no mueve nada.
- `parity.test.ts` (nuevo, 3 casos): descrito en §3.
- Resto sin cambios (12 ficheros / 79).

### Base de datos (`pnpm db:test` → 8 ficheros / 123, PASS)

Sin cambios: la tarea no toca esquema. Se ejecuta como comprobación de no
regresión.

### Extremo a extremo (`pnpm e2e` → 44 passed)

- `identity-a11y.spec.ts` (nuevo, 4 casos ×2 dispositivos):
  - **login, foco por intento**: envío en vacío → `role="alert"` con el mensaje,
    foco en el campo de correo, `aria-invalid="true"` y
    `aria-describedby="login-error"`; el usuario rellena (el foco queda en
    contraseña) y reenvía → el foco **vuelve** al correo. Es la aserción que
    falla con un efecto atado solo al montaje.
  - **login, error por URL**: `/es/login?error=missing-recovery-session` pinta
    `#login-error` (`role="alert"` + texto) en el primer render y el campo de
    correo ya lo referencia — no hay `aria-describedby` colgando.
  - **pantalla de éxito**: enviar `forgot-password` con un correo válido → el
    `role="status"` con «Revisa tu correo» recibe el foco (no se queda en
    `<body>`).
  - **onboarding**: enviar sin elegir nivel declarado → sigue en `/onboarding`,
    el grupo tiene `aria-invalid="true"` y recibe el foco, y el mensaje «Elige
    tu nivel actual.» es visible.
- `auth.spec.ts` (1 aserción ajustada): «una contraseña incorrecta da un error
  genérico» comprobaba `role="alert"` **en el `<p>`**; con `FormError` el rol
  está en el contenedor `#login-error`. Se localiza la región por su `id` y se
  comprueba `role` + texto. Mismo tipo de ajuste a un test existente que en
  LEX-2.8 y LEX-2.9 (consecuencia directa del cambio de estructura, no un
  flake).
- Un fallo transitorio de GoTrue en el alta bajo carga paralela con dos
  proyectos Supabase (`__next_error__` en `/es/signup`, ajeno a esta tarea, ya
  documentado en LEX-2.9) en una pasada; re-ejecución del spec 4/4 y del
  conjunto 40/40.

## 5. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 8/8, vitest 14 ficheros/85, build)
pnpm db:test   8 ficheros / 123 asserciones, PASS (sin cambios: no toca esquema)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       44 passed (verde a la primera en la última pasada; ver §7 sobre el flake de GoTrue)
```

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/shared/presentation/hooks/use-focus-first-invalid.ts` (+ `.test.tsx`) | Nuevo. Hook de foco al primer campo inválido + 3 casos jsdom. |
| `src/shared/presentation/components/form-error.tsx` | Nuevo. Región `role="alert"` con `id` estable. |
| `src/shared/presentation/components/form-status.tsx` | Nuevo. Pantalla de éxito `role="status"` que toma el foco al montarse. |
| `src/shared/presentation/components/index.ts` | Exporta `FormError` y `FormStatus`. |
| `src/app/[locale]/(auth)/login/login-form.tsx` | `FormError` + `aria-describedby` + `useFocusFirstInvalid`; `invalid` pasa a `Boolean(state.error)` (era solo `invalid-credentials`). |
| `src/app/[locale]/(auth)/signup/signup-form.tsx` | `FormError` + `FormStatus` + `aria-describedby` (fusionado con `password-hint`) + hook. |
| `src/app/[locale]/(auth)/forgot-password/forgot-password-form.tsx` | `FormError` + `FormStatus` + `aria-describedby` + hook. |
| `src/app/[locale]/(auth)/reset-password/reset-password-form.tsx` | `FormError` + `FormStatus` + `aria-describedby` (fusionado con `password-hint`) + hook. |
| `src/app/[locale]/(app)/onboarding/onboarding-form.tsx` | `FormError` + hook; **grupos de radio inválidos** con `aria-invalid` + `aria-describedby` + `tabIndex={-1}` + `<legend>` en color de error (deuda de LEX-2.8). |
| `tests/unit/messages/parity.test.ts` | Nuevo. Candado de paridad ES/EN, árbol completo, dos direcciones. |
| `tests/e2e/identity-a11y.spec.ts` | Nuevo. Foco al primer error en login y onboarding. |
| `tests/e2e/auth.spec.ts` | 1 aserción: `role="alert"` pasó del `<p>` al contenedor `#login-error`. |
| `docs/STATUS.md`, `docs/evidence/LEX-2.10.md` | Estado y evidencia. |

Migraciones: **0**.

## 7. Riesgos y deuda

- **Sin herramienta automática de a11y** (axe / `jsx-a11y`) en el gate: no está
  instalada y añadirla es una decisión de stack fuera del alcance de esta tarea.
  La verificación es RTL para el comportamiento interactivo (foco) + revisión
  manual de roles y `aria-*`. Deuda anotada para una tarea de tooling.
- **`aria-invalid` en `<fieldset>`** no es un patrón con soporte uniforme en
  todos los lectores de pantalla; el color de la `<legend>` y el `role="alert"`
  que enumera las pegas son el respaldo visible y anunciado.
- **Sin revisión cruzada independiente** (§3.6, accesibilidad y textos). No hay
  segundo agente. Deuda visible, arrastrada desde LEX-2.3.
- **Flake de GoTrue en el alta bajo carga paralela** (`__next_error__` en
  `/es/signup` con dos proyectos Supabase y dos workers de Playwright): visto en
  una pasada de LEX-2.7, LEX-2.9 y una primera pasada de esta tarea; siempre
  verde al repetir y en CI. **LEX-2.11 es la auditoría E2E con dos usuarios**:
  ese flake estará en su camino directo y «documentado como conocido» no
  sobrevive a una fila de auditoría. LEX-2.11 debe fijarlo (causa raíz) o
  decidir una política de reintento explícita, no volver a descubrirlo.

## 8. Estado del árbol Git

Rama `feat/lex-2-10-identity-states` desde `main` (`33c8c79`), dos commits
(`5665908` estados y accesibilidad; `a22d4a3` foco en las pantallas de éxito y
más cobertura e2e). PR #18 fusionada a `main` (merge `4619dbe`); CI verde en los
tres trabajos (`Calidad`, `Base de datos`, `Extremo a extremo`), runs
`33650503266` (PR) y `33650912529` (merge). Rama borrada.

## 9. Siguiente tarea

**LEX-2.11** — auditoría E2E y de M2 con dos usuarios (registro / onboarding /
sesión / recuperación probados de punta a punta; A y B aislados por interfaz,
servidor y RLS; migración desde base limpia y CI verde). Cierra FASE 2 / M2. No
se inicia aquí.
