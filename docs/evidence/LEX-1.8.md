# LEX-1.8 — Clientes Supabase SSR separados

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-8-supabase-ssr`
**Estado resultante:** `HECHO`

---

## 1. Qué se ha construido

`@supabase/ssr@0.12.5` con `@supabase/supabase-js@2.112.4`, siguiendo el patrón
oficial vigente consultado en la documentación, no escrito de memoria.

| Fichero | Contexto |
|---|---|
| `browser-client.ts` | Código que corre en el navegador. |
| `server-client.ts` | Server Components, Server Actions y Route Handlers. Importa `server-only`. |
| `session.ts` | Renovación de token desde el proxy. |

Los tres leen la configuración de `src/env/client.ts`, no de `process.env` con
`!`. La validación de LEX-1.4 sigue aplicándose: si falta una variable, la
aplicación no arranca, en vez de fallar en la primera consulta.

## 2. Ningún cliente privilegiado

Los tres usan la **misma clave publishable**. No hay un cliente con clave secreta,
y no debería haberlo.

La identidad la aporta la cookie de sesión; los permisos los decide Row Level
Security dentro de PostgreSQL. Un cliente con clave privilegiada saltaría RLS por
completo, y entonces cualquier descuido en una consulta expondría datos de otros
usuarios: el error dejaría de ser detectable en la revisión.

Corolario incómodo pero necesario: **RLS no es una capa de seguridad más, es la
capa.** La clave publishable está dentro del bundle que descarga cualquier
visitante. Una tabla sin políticas queda abierta a Internet, no protegida por la
interfaz.

## 3. Una instancia por petición

`createSupabaseServerClient()` lee las cookies de la petición en curso, así que se
crea una por petición.

Reutilizar una instancia entre peticiones serviría a un usuario la sesión de otro.
Es el fallo de aislamiento más grave posible aquí y **no daría ningún error
visible**: la página cargaría, con los datos equivocados. Crear un cliente es
barato; crearlo una sola vez sale carísimo.

## 4. `getClaims()`, nunca `getSession()`

`getSession()` devuelve lo que haya en la cookie sin comprobar que sea auténtico.
Una cookie la escribe el navegador, y el navegador está bajo el control de quien
lo usa: confiar en ella para decidir permisos equivale a preguntarle al visitante
quién dice ser y creerle. `getClaims()` verifica la firma del token contra las
claves públicas del proyecto.

**No se ha dejado como norma escrita.** `eslint.config.mjs` rechaza cualquier
llamada a `getSession()` en `src/`, con un mensaje que explica la diferencia. Un
caso legítimo —los hay en cliente— tendrá que desactivar la regla en esa línea y
justificarlo, y así la excepción deja rastro en el diff.

## 5. El proxy: dos pasos y un orden que importa

`src/proxy.ts` ya resolvía el idioma. Ahora además renueva la sesión.

1. `next-intl` decide el locale y **puede devolver una redirección**.
2. La sesión se renueva **sobre esa misma respuesta**.

El error fácil es tratar los pasos como independientes y crear una respuesta nueva
en el segundo, descartando la decisión del primero. El síntoma sería sutil: la
sesión se renueva, pero el usuario acaba en el idioma que no eligió.

Las cookies se escriben en **dos** sitios, y ambos hacen falta:

- en `request`, para que los Server Components de esta misma petición vean el
  token renovado y no el caducado;
- en `response`, para que el navegador lo guarde para las siguientes.

Solo en `response`: la petición actual sigue con el token viejo. Solo en
`request`: la sesión se renueva y se pierde al terminar.

## 6. Comprobado, no supuesto

Como en LEX-1.4, las barreras se probaron rompiéndolas.

### La regla de `getSession()` falla el lint

```text
5:26  error  getSession() no verifica la firma del token: devuelve lo que diga
             la cookie. Usa getClaims() para cualquier decision de permisos
             no-restricted-syntax
```

### Un componente de cliente no alcanza el cliente de servidor

Hay **dos barreras independientes**, y se comprobaron las dos por separado.

La primera es la regla de capas de LEX-1.3, que salta antes:

```text
3:1  error  '@/shared/infrastructure/supabase/server-client' import is restricted
            from being used by a pattern. La presentacion llama a un caso de uso,
            no a un repositorio (ADR-001)
```

Para llegar a la segunda hubo que esquivar la primera, poniendo la sonda dentro de
`infrastructure/`, donde la regla de capas no aplica. Entonces salta `server-only`,
en tiempo de build:

```text
Client Component Browser:
  ./src/shared/infrastructure/supabase/server-client.ts
  ./src/shared/infrastructure/_probe/probe-client.tsx
  ./src/app/[locale]/page.tsx

build exit=1
```

Que la arquitectura lo detecte antes que el mecanismo de Next.js es buena señal,
pero no habría bastado comprobar solo la primera: quien escribe código dentro de
infraestructura no está cubierto por ella.

Ambas sondas retiradas.

### El proxy no rompió lo anterior

La suite E2E de LEX-1.11 sigue en verde con la renovación de sesión encadenada:

```text
12 passed (26.1s)
```

Esos doce tests cubren idioma, redirección, 404, conmutador y tema. Si la
composición del proxy estuviera mal, varios fallarían.

## 7. Verificaciones ejecutadas

```text
pnpm lint     exit=1 con las sondas              (comportamiento esperado)
pnpm build    exit=1 con la sonda de server-only (esperado)
pnpm check    exit=0 tras retirarlas
pnpm e2e      12 passed
```

## 8. Fuera de alcance

- Registro, inicio de sesión y recuperación → fase 2.
- Protección de rutas privadas → fase 2.
- Políticas RLS y sus tests → fase 2, con las primeras tablas.
