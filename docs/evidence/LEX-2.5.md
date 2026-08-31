# LEX-2.5 — Registro, verificación, login, logout y recuperación

**Fecha:** 2026-08-31
**Rama:** `feat/lex-2-5-auth-flows`
**Estado resultante:** `HECHO`

---

## 1. Alcance y una nota de proceso

Flujos de correo y contraseña con Supabase Auth SSR: alta, inicio y cierre de
sesión, y recuperación de contraseña (solicitud + cambio). Traducidos ES/EN,
con redirecciones por lista blanca y errores que no revelan si una cuenta
existe. Google OAuth queda fuera, como dice el criterio.

`ROADMAP.md` §2.5 pide proponer una división antes de empezar cuando una tarea
combina varias pantallas. LEX-2.5 son cinco (`login`, `signup`,
`forgot-password`, `reset-password`, callback). Se entrega como un solo PR por
indicación expresa del propietario de no detenerse a preguntar. Se deja anotado;
no es un `Q-nnn`.

Lo que **no** entra (y dónde entra): protección de rutas y no-cacheo de páginas
privadas → LEX-2.6; home autenticada y selector de curso → LEX-2.9; pulido de
estados de carga/vacío/error y auditoría de accesibilidad → LEX-2.10; SMTP de
producción → LEX-9.7.

## 2. Arquitectura

Regla de capas de ADR-001, comprobada por ESLint:

| Archivo | Capa | Papel |
|---|---|---|
| `application/credentials.ts` | aplicación | Esquemas Zod de correo y contraseña. Devuelven **claves estables** (`email-invalid`, `password-too-short`…), no texto. |
| `application/safe-redirect.ts` | aplicación | `resolveSafeRedirect`: solo acepta una ruta absoluta de este sitio; todo lo demás cae al fallback. |
| `application/auth-gateway.ts` | aplicación | Puerto `AuthGateway` + tipos de error del dominio. |
| `application/auth-flows.ts` | aplicación | Casos de uso `registerUser` / `signInUser` / `requestPasswordReset` / `updatePassword`. Validan, llaman al puerto, devuelven `AuthResult` con clave de error. Un fallo de infraestructura es `auth-unavailable`, no una excepción. |
| `infrastructure/supabase-auth-gateway.ts` | infraestructura | Implementa `AuthGateway` sobre `supabase.auth.*`. Traduce los errores de GoTrue. |
| `composition/identity.ts` | composición | `registerVisitor` / `signInVisitor` / `signOutVisitor` / `requestPasswordResetFor` / `updateCurrentPassword` / `completeAuthCallback` / `getCurrentUserId`. Cablea, y tras autenticar llama a `ensureProfileForCurrentUser()` (LEX-2.4). |
| `app/[locale]/(auth)/actions.ts` | presentación | Server Actions delgadas. Leen el formulario, llaman a composición, devuelven la clave de error; el `locale` va en campo oculto y se valida contra `routing.locales` antes de entrar en `redirect()`, igual que `next`. |
| `app/[locale]/(auth)/{login,signup,forgot-password,reset-password}/` | presentación | Página (Server Component) + formulario (Client Component con `useActionState`). El componente traduce la clave de error con `useTranslations`. |
| `app/api/auth/callback/route.ts` | presentación | Canjea el `code` del enlace de correo (vía composición) y redirige a `next` seguro o a la portada. Bajo `/api` a propósito: el `matcher` de `proxy.ts` lo excluye, así que `next-intl` no reescribe la URL antes de leer el `code`. |
| `app/[locale]/session-controls.tsx` | presentación | «Entrar» o «Cerrar sesión» según `getCurrentUserId()`. En la portada. La hace dinámica por petición: es el precio de mostrar estado de sesión. |

## 3. No se revela si un correo existe (gate §12.6)

- **Alta con correo repetido:** el stack local, con `enable_confirmations =
  false`, devuelve `user_already_exists` (422) en vez de la respuesta ofuscada.
  El adaptador lo traduce al **mismo** resultado que un alta nueva pendiente de
  confirmar. Verificado a mano contra GoTrue local (dos `POST /auth/v1/signup`
  con el mismo correo) y en el test de `auth-flows` («un correo ya registrado no
  se distingue de uno nuevo»).
- **Login:** cualquier error de credenciales —formato, contraseña incorrecta,
  `email_not_confirmed`— es el mismo mensaje, `invalid-credentials`.
- **Recuperación:** un correo desconocido termina igual que uno conocido
  («Revisa tu correo»); solo un correo mal formado se avisa.

## 4. Redirecciones (gate §16.1)

`resolveSafeRedirect` rechaza `//host`, `/\host`, `https://…`, `javascript:`,
barras invertidas, espacios y control; acepta solo `/(...)`. Se aplica en el
campo `next` del login, en el destino del callback y en el `redirect()` final.
14 asserciones en `safe-redirect.test.ts`, incluidos todos los vectores del
párrafo.

## 5. Config local

`supabase/config.toml`: `site_url` pasa de `http://127.0.0.1:3000` a
`http://localhost:3000` (lo que sirven `pnpm start` y Playwright, y lo que dice
`NEXT_PUBLIC_SITE_URL`). Sin ese cambio GoTrue ignora el `redirectTo` del correo
de recuperación y redirige a `site_url`: el enlace «funciona» y no lleva a
ninguna parte. `additional_redirect_urls` pasa a cubrir `localhost` y
`127.0.0.1` con `/**`. **Solo afecta al entorno local**; el de producción se
configura en LEX-9.7.

## 6. Tests

### Unitarios (Vitest) — módulo `identity`, sin red

```text
safe-redirect.test.ts   8 casos (14 asserciones): acepta rutas internas; rechaza host, esquema, control
credentials.test.ts     7 casos: formato de correo, longitud de contraseña, normalización, entradas no-cadena
auth-flows.test.ts      con AuthGateway falso: valida antes de llamar; correo repetido == correo nuevo;
                        login = un solo mensaje; recuperación resuelve exista o no; infra → auth-unavailable
```

`pnpm test`: 7 ficheros, 48 tests, PASS.

### Extremo a extremo (Playwright) — `tests/e2e/auth.spec.ts`

Contra el build de producción, escritorio + Poco F5:

- **alta → cierre → reinicio de sesión:** el alta redirige a la portada y deja
  cookie de sesión; «Cerrar sesión» vuelve a `/login` y borra la cookie; se
  vuelve a entrar con las mismas credenciales.
- **contraseña incorrecta:** mensaje genérico visible con `role="alert"`, la URL
  sigue en `/login`.
- **recuperación:** responde «Revisa tu correo» con un correo cualquiera.
- **`/en/signup`** se sirve en inglés (título, etiqueta y botón).

`pnpm e2e`: 22 passed (14 de la portada, 8 nuevos).

### Verificación por rotura de la lista blanca

`resolveSafeRedirect` se probó a mano devolviendo siempre `raw`: los 6 casos de
rechazo de `safe-redirect.test.ts` fallan; restaurado, PASS.

## 7. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 7/48, build)
pnpm db:test   6 ficheros, 83 asserciones, PASS
pnpm e2e       22 passed
pnpm db:types  sin cambios; git diff vacío (LEX-2.5 no toca el esquema)
```

## 8. Comprobaciones manuales pendientes (propietario)

1. **Verificación por correo real:** en local `enable_confirmations = false`, así
   que el alta no manda correo. Con confirmaciones activadas, comprobar que el
   enlace de `Mailpit` (`http://127.0.0.1:54324`) pasa por `/api/auth/callback`
   y deja iniciar sesión.
2. **Recuperación de contraseña de principio a fin:** solicitar, abrir el correo
   en Mailpit, seguir el enlace, cambiar la contraseña, entrar con la nueva.
3. Revisión cruzada independiente (§3.6): sesión SSR y redirects.

## 9. Riesgos y deuda

- La portada se sirve ahora por petición (lee `getClaims()`). Aceptado; la
  navegación autenticada de verdad llega en LEX-2.6/2.9.
- Sin límite de intentos propio en el login más allá del de GoTrue
  (`sign_in_sign_ups = 30 / 5 min`). El gate §12.6 pide «rate limits en
  operaciones abusables»; se apoya en el de Supabase para la V1 y se revisa en
  el hardening (FASE 9).
- Estados de carga/error/success mínimos; su pulido y la auditoría de
  accesibilidad son LEX-2.10.
- Sin test E2E que afirme la fila de `profiles` tras el alta: el seam
  (`registerVisitor` → `ensureProfileForCurrentUser`) se ejecuta y se prueba en
  `050-profile-creation.sql` y en los tests de `ensure-profile`; el E2E solo
  comprueba la cookie de sesión.

## 10. Archivos

Nuevos: `src/modules/identity/application/{credentials,safe-redirect,auth-gateway,auth-flows}.ts`
(+ `.test.ts` de los tres primeros),
`src/modules/identity/infrastructure/supabase-auth-gateway.ts`,
`src/composition/identity.ts` (ampliado),
`src/app/[locale]/(auth)/` (layout, actions, 4×{page,form}, `_components/`),
`src/app/[locale]/session-controls.tsx`,
`src/app/api/auth/callback/route.ts`,
`tests/e2e/auth.spec.ts`.
Modificados: `messages/{es,en}.json` (namespace `Auth`),
`src/app/[locale]/page.tsx` (cabecera con `SessionControls`),
`supabase/config.toml` (`site_url` local).

Migraciones: **ninguna**.

## 11. Estado del árbol Git

Rama `feat/lex-2-5-auth-flows` desde `main` (`e0b768d`). Pendiente de commit, PR
y CI.

## 12. Siguiente tarea

**LEX-2.6** — proteger rutas y mantener sesión SSR: usuario anónimo no entra en
el área privada, cookies seguras, renovación/cierre comprobados, páginas
privadas fuera de caché compartida. Llamará a `ensureProfileForCurrentUser()` a
la entrada del área autenticada (cierra la ventana sin perfil de ADR-005).
Depende de LEX-2.5. No se inicia aquí.
