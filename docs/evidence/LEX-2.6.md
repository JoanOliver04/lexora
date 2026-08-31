# LEX-2.6 — Proteger rutas y mantener sesión SSR

**Fecha:** 2026-08-31
**Rama:** `feat/lex-2-6-route-protection`
**Estado resultante:** `HECHO`

---

## 1. Alcance

Un usuario anónimo no alcanza el área autenticada; se le redirige a `login`
conservando el destino. Las respuestas de rutas privadas no son cacheables de
forma compartida. A la entrada del área autenticada se asegura el perfil
(cierra la ventana de ADR-005). La home real —selector de curso incluido— es
LEX-2.9; aquí hay un marcador de posición en `/{locale}/app` para que la puerta
tenga algo que proteger.

## 2. Dos barreras

| Capa | Archivo | Papel |
|---|---|---|
| Proxy | `src/proxy.ts` | **Comodidad.** Si la ruta es privada y no hay sesión verificada, redirige a `/{locale}/login?next=<ruta segura>` antes de renderizar nada. Marca las respuestas privadas `Cache-Control: private, no-store`. |
| Layout de `(app)` | `src/app/[locale]/(app)/layout.tsx` | **Barrera de verdad.** `getCurrentUserId()` en el servidor, en cada render. Si es `null`, redirige a `/{locale}/login` **a secas** —sin `next`—: si se llega aquí sin sesión algo ha fallado antes y no se confía en el `next` del cliente. Con sesión, `ensureProfileForCurrentUser()`. `force-dynamic` mantiene el subárbol fuera del render estático. |

El `next` lo posee el proxy, que ve la ruta real; el layout es una negación
simple. Así los dos nunca discrepan sobre el destino.

## 3. Un fallo latente del `matcher`, corregido

`src/proxy.ts` traía desde LEX-1.5 `matcher: "…|.*\..*).*)"`. En una cadena de
JavaScript `\.` no es un escape válido: la barra se descarta y queda `.` —
«cualquier carácter»—. El negative lookahead pasaba entonces a descartar
**toda** ruta con contenido, y **el proxy solo se ejecutaba en `/`**. La
renovación de sesión de LEX-1.8 y esta puerta necesitan que corra en
`/{locale}/…`. Se corrige a `.*\\..*` (en la cadena → `\.` → punto literal en la
regex). Comprobado contra un servidor de producción:

```text
/           x-lex-proxy presente, redirige a /es      (ya funcionaba)
/es         x-lex-proxy presente                      (antes: NO)
/es/app     307 → /es/login?next=%2Fes%2Fapp          (antes: lo cazaba solo el layout, sin next)
/favicon.ico  el proxy no lo toca                      (correcto)
```

## 4. `refreshSupabaseSession` devuelve el `userId`

`session.ts` ya llamaba a `getClaims()` (firma verificada) y tiraba el
resultado. Ahora devuelve `{ response, userId }`: el proxy decide la puerta con
esa comprobación, sin un segundo `getClaims()` por petición, y con una sola
fuente de verdad sobre «quién es». El bloque de comentario de LEX-1.8 se
conserva y se amplía.

## 5. `isProtectedPath` (aplicación, puro)

`src/modules/identity/application/protected-paths.ts`. Hoy solo
`/{locale}/app` y lo que cuelgue de ella; las fases siguientes añaden segmentos.
Se comprueba el `pathname` tal cual **y decodificado**, para que
`/{locale}/%61pp` no se cuele. 6 casos en el test: cada idioma, `/es/app/x`,
`/es/apple` (no), sin prefijo de idioma (no), mayúsculas (no), evasión por
porcentaje (sí), `pathname` mal formado (no lanza).

## 6. Tests

### Unitarios

`protected-paths.test.ts`: 6 casos (arriba). `pnpm test`: 8 ficheros, 54 tests,
PASS.

### Extremo a extremo — `tests/e2e/protected.spec.ts` (3 × 2 dispositivos)

- un anónimo que va a `/es/app` acaba en `/es/login?next=%2Fes%2Fapp` con el
  formulario de entrada;
- alta → cerrar sesión → ir a `/es/app` → entrar desde ese login → **se llega a
  `/es/app`** («Área privada»); cerrar sesión desde dentro → el área vuelve a
  estar cerrada;
- `GET /es/app` sin seguir la redirección → `307` con
  `cache-control: private, no-store`.

`pnpm e2e`: 28 passed (14 portada + 8 auth + 6 puerta).

## 7. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 8 ficheros/54, build)
pnpm db:test   6 ficheros, 83 asserciones, PASS
pnpm e2e       28 passed
pnpm db:types  sin cambios
```

## 8. Archivos

| Archivo | Cambio |
|---|---|
| `src/proxy.ts` | Puerta de rutas privadas + `Cache-Control` + corrección del `matcher`. |
| `src/shared/infrastructure/supabase/session.ts` | `refreshSupabaseSession` devuelve `{ response, userId }`. |
| `src/shared/infrastructure/supabase/README.md` | Nota del nuevo retorno. |
| `src/modules/identity/application/protected-paths.ts` (+ `.test.ts`) | Nuevo. `isProtectedPath`. |
| `src/app/[locale]/(app)/layout.tsx` | Nuevo. Barrera autoritativa + `ensureProfileForCurrentUser()`. |
| `src/app/[locale]/(app)/app/page.tsx` | Nuevo. Marcador de posición del área privada (real = LEX-2.9). |
| `messages/{es,en}.json` | Namespace `App`. |
| `tests/e2e/protected.spec.ts` | Nuevo. |
| `docs/evidence/LEX-2.6.md` | Nuevo. |

Migraciones: **ninguna**.

## 9. Riesgos y deuda

- **Renovación del token en la expiración** no se prueba en E2E (haría falta
  control del reloj del navegador). El mecanismo —`getClaims()` en el proxy,
  cookies escritas en `request` y `response`— es el de LEX-1.8, ahora corriendo
  de verdad en `/{locale}/…` gracias a la corrección del `matcher`. Queda como
  comprobación manual / de FASE 9.
- El `matcher` corregido hace que el proxy llame a `getClaims()` (un `fetch` a
  Supabase) en cada navegación a `/{locale}/…`. `getClaims()` no lanza ante un
  fallo de red —devuelve `{ error }`—, así que el proxy no rompe la página; pero
  es una llamada de red por petición que antes no ocurría. Aceptable para la
  V1; el hardening de rendimiento es FASE 9.
- Sin revisión cruzada independiente (§3.6, sesión SSR y redirects): no hay
  segundo agente. Deuda visible.
- Marcador de posición en `/{locale}/app` sin navegación que lleve a él desde la
  portada; lo añade LEX-2.9.

## 10. Estado del árbol Git

Rama `feat/lex-2-6-route-protection` desde `main` (`88287f0`). Pendiente de
commit, PR y CI.

## 11. Siguiente tarea

**LEX-2.7** — dominio y caso de uso de onboarding: valida UI locale, idioma de
apoyo, objetivo, nivel declarado, nivel inicial y límite de nuevos; operación
idempotente que crea curso + configuración. Depende de LEX-2.1. No se inicia
aquí.
