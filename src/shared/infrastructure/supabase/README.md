# Supabase — infraestructura compartida

## Qué cliente usar y dónde

| Contexto | Cliente | Fichero |
|---|---|---|
| Componente de cliente, navegador | `createSupabaseBrowserClient()` | `browser-client.ts` |
| Server Component, Server Action, Route Handler | `createSupabaseServerClient()` | `server-client.ts` |
| Proxy | `refreshSupabaseSession()` | `session.ts` |

**Los tres usan la misma clave publishable.** No hay un cliente privilegiado, y no
debería haberlo: la identidad la aporta la cookie de sesión y los permisos los
decide Row Level Security dentro de PostgreSQL. Un cliente con clave privilegiada
saltaría RLS por completo, de modo que cualquier descuido en una consulta
expondría datos de otros usuarios.

Corolario: **RLS no es una capa de seguridad más, es la capa.** La clave
publishable está en el bundle que descarga cualquiera. Una tabla sin políticas
queda abierta a Internet.

## Una instancia por petición

`createSupabaseServerClient()` lee las cookies de la petición en curso.
Reutilizar una instancia entre peticiones serviría a un usuario la sesión de
otro, y no daría ningún error visible. Crear un cliente es barato; crearlo una
sola vez sale carísimo.

## `getClaims()`, nunca `getSession()`

`getSession()` devuelve lo que haya en la cookie sin comprobar que sea auténtico.
Una cookie la escribe el navegador, y el navegador está bajo el control de quien
lo usa: confiar en ella para decidir permisos equivale a preguntarle al visitante
quién dice ser y creerle.

`getClaims()` verifica la firma del token contra las claves públicas del proyecto.

**Está impuesto por lint.** `eslint.config.mjs` rechaza cualquier llamada a
`getSession()` en `src/`. Un caso legítimo tendrá que desactivar la regla en esa
línea y explicar por qué, que es exactamente lo que se quiere: que la excepción
deje rastro en el diff.

## `database.types.ts`

**Generado. No se edita a mano.**

```bash
pnpm db:types
```

Se produce desde el esquema real de la base de datos local, que a su vez sale de
las migraciones versionadas. El esquema es la fuente de verdad; este fichero es
su reflejo en TypeScript.

**Se regenera en el mismo commit que la migración que lo cambia.** Si se separan,
el tipo y la tabla dejan de coincidir y el compilador empieza a aprobar consultas
que la base de datos rechazará en tiempo de ejecución. La CI comprobará la
alineación a partir de LEX-1.12.

Está excluido de Prettier y de ESLint: formatear un fichero generado produce un
diff en cada regeneración y no aporta nada.
