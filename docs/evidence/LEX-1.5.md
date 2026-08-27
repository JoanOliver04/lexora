# LEX-1.5 — Internacionalización ES/EN

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-5-i18n`
**Estado resultante:** `HECHO`

---

## 1. Qué se ha construido

`next-intl@4.14.0`, con enrutado por prefijo de idioma.

| Archivo | Papel |
|---|---|
| `src/i18n/routing.ts` | Idiomas de interfaz disponibles y cuál es el de por defecto. |
| `src/i18n/request.ts` | Resuelve el idioma de cada petición y carga sus mensajes. |
| `src/i18n/navigation.ts` | `Link`, `redirect`, `useRouter` y `usePathname` conscientes del idioma. |
| `src/proxy.ts` | Detección de idioma y redirección. En Next.js 16 este archivo ya no se llama `middleware.ts`. |
| `messages/es.json`, `messages/en.json` | Los textos. Ninguno vive dentro de un componente. |
| `src/app/[locale]/` | Layout y página, movidos bajo el segmento de idioma. |

## 2. La separación de los cuatro idiomas

Es el punto que importa de esta tarea, y está documentado dentro de
`src/i18n/routing.ts`, no solo en el glosario:

| Concepto | Qué es | Dónde vive |
|---|---|---|
| Idioma de interfaz | En qué idioma se le habla al usuario | `routing.ts` |
| Idioma de apoyo | El idioma que el usuario ya domina | Perfil y curso (fase 2) |
| Idioma objetivo | El idioma que estudia | Curso (fase 2) |
| Variante del contenido | La variante regional del material | Curso (fase 2) |

Que la interfaz esté en inglés no significa que el usuario estudie inglés, ni que
su idioma de apoyo deje de ser el español. El tipo se llama `UiLocale` y no
`Locale` a propósito: el nombre corto invitaría a reutilizarlo para el idioma
estudiado, que es exactamente el error que hay que evitar.

## 3. Verificación en ejecución

Build de producción, servidor arrancado, peticiones reales:

```text
/es   HTTP 200   lang="es"   "Aprende y mantén tu inglés…"
/en   HTTP 200   lang="en"   "Learn and keep your English through active recall."
/     HTTP 307   redirección al idioma por defecto
/fr   HTTP 404
```

Cuatro cosas comprobadas ahí:

1. **Los dos idiomas sirven contenido distinto**, no la misma página con una bandera.
2. **`lang` del documento coincide con el idioma servido.** No es cosmético: los
   lectores de pantalla lo usan para elegir voz y pronunciación. Una página en
   español anunciada como `lang="en"` se lee con acento inglés y resulta
   incomprensible.
3. **La raíz redirige** en lugar de dar un 404.
4. **Un idioma inexistente da 404**, no una página en blanco ni un error de
   servidor.

Salida del build:

```text
Route (app)
┌ ○ /_not-found
└   /[locale]
  ├ ● /es
  └ ● /en

ƒ Proxy (Middleware)
```

Ambos idiomas se prerenderizan como HTML estático mediante `generateStaticParams`,
en lugar de resolverse en cada petición.

## 4. El segmento de la URL se valida

`[locale]` viene de la URL, que escribe quien quiera. Se comprueba con `hasLocale`
en dos sitios:

- En `request.ts`, **antes** de `import(\`../../messages/${locale}.json\`)`. Sin esa
  comprobación sería una importación con una ruta que controla el usuario.
- En el layout, donde un idioma desconocido llama a `notFound()`.

## 5. Decisión sobre los scripts de instalación

Instalar `next-intl` arrastró `@parcel/watcher` y `@swc/core`, y pnpm 11 se negó a
seguir hasta que se decidiera si podían ejecutar sus scripts de `postinstall`.

**Los cuatro paquetes de la lista quedan denegados.** Un `postinstall` ejecuta
código arbitrario de un tercero en esta máquina y en la CI, durante
`pnpm install`. Denegar es el valor por defecto correcto; cada `true` tendría que
justificarse con algo concreto que se rompa sin él.

Se comprobó que no hace falta ninguno: `pnpm build` pasa con los cuatro denegados.
El razonamiento queda escrito en `pnpm-workspace.yaml`, junto a la lista, para que
la próxima vez no haya que volver a pensarlo.

## 6. Un tropiezo que conviene conocer

Tras mover `layout.tsx` y `page.tsx` a `src/app/[locale]/`, `pnpm typecheck` falló:

```text
.next/dev/types/validator.ts(42,39):
  error TS2307: Cannot find module '../../../src/app/page.js'
```

Los tipos generados por Next.js seguían describiendo el árbol de rutas anterior.
No es un error del código: es caché. Se resuelve borrando `.next`.

La CI no lo sufrirá porque siempre parte de un árbol limpio, pero en local
aparecerá cada vez que se mueva o renombre una ruta. **Si `typecheck` se queja de
un fichero que ya no existe, borra `.next` antes de buscar el fallo en otra
parte.**

## 7. Fuera de alcance, deliberadamente

- La landing real es LEX-1.13. La página actual es una demostración de que la
  traducción funciona, con tres frases.
- El sistema visual es LEX-1.6. Los estilos actuales son los mínimos para que la
  página no resulte hostil.
- Persistir la preferencia de idioma entre sesiones llega con el perfil de
  usuario, en la fase 2. Hoy el idioma vive en la URL, que es lo correcto: es
  compartible y no depende de que exista una cuenta.

## 8. Verificaciones ejecutadas

```text
pnpm format:check   All matched files use Prettier code style!
pnpm lint           exit=0
pnpm typecheck      exit=0
pnpm build          exit=0
pnpm check          exit=0
```
