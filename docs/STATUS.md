# Lexora — Estado actual

**Última actualización:** 2026-08-27
**Fase actual:** FASE 1 — Fundación técnica — `EN PROCESO` (12/14)
**Hito actual:** M1 — Fundación técnica reproducible — `EN PROCESO`
**Tarea activa:** ninguna
**Estado de la tarea:** FASE 0 completa (LEX-0.1…0.8) · **LEX-1.1 a LEX-1.11 `HECHO`**, salvo LEX-1.12 a LEX-1.14
**Rama / commit base / HEAD:** `main` / `4a628be` (`v0.1.0-m0`) / ver «Estado de git»

> El roadmap detallado y la especificación maestra son documentos privados y
> locales; no forman parte de este repositorio público. Ver
> [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) Q-002.

---

## Terminado en esta sesión

### Q-004 resuelta — el repositorio es público

`main` y la etiqueta `v0.1.0-m0` publicadas en
[JoanOliver04/lexora](https://github.com/JoanOliver04/lexora). 33 commits, 89
ficheros.

Comprobado **antes** de publicar, porque en un repositorio público el historial es
permanente: remoto vacío, ficheros auditados, `.env.example` sin valores reales y
ninguna clave en el historial completo. Una coincidencia de `sb_secret_` resultó
ser el texto de aviso del propio `.env.example`; se verificó en lugar de suponerlo.

### LEX-1.12 — CI en GitHub Actions — `HECHO`

Informe completo en [`evidence/LEX-1.12.md`](evidence/LEX-1.12.md).
[Pull Request #1](https://github.com/JoanOliver04/lexora/pull/1).

Tres trabajos en paralelo, **verde a la primera**:

```text
✓ Calidad           35s    formato, lint, tipos, contraste, tests, build
✓ Extremo a extremo 1m2s   Playwright sobre Chromium
✓ Base de datos     2m23s  migraciones desde vacío, pgTAP, tipos alineados
```

**Dos detalles vienen de hallazgos previos, no de una plantilla.** `next typegen`
antes de `tsc`, sin lo cual el trabajo habría fallado en la primera ejecución por
un motivo ajeno al código. Y el control de que `database.types.ts` corresponde al
esquema: cuando se separan, el compilador aprueba consultas que la base rechazará
en ejecución.

**Un resultado que merece un matiz:** los tipos regenerados en Linux coincidieron
byte a byte con los generados en Windows. No estaba garantizado —los finales de
línea son la causa habitual de que no coincida— y confirma que el `.gitattributes`
de LEX-1.6 hace su trabajo.

**El control de tipos se probó fallando**, simulando la deriva en local: mismo
resultado, sin ensuciar el historial del PR ni gastar minutos.

### LEX-1.10 — pgTAP y arnés de base de datos — `HECHO`

Informe completo en [`evidence/LEX-1.10.md`](evidence/LEX-1.10.md).

En LEX-1.8 quedó escrito que una tabla sin políticas queda abierta a Internet.
Afirmar eso obliga a poder demostrarlo: sin pgTAP, «RLS protege los datos» es una
frase en un documento.

`supabase/tests/database/` con `pnpm db:test`. Dos ficheros: el arnés y un
**invariante permanente** —toda tabla de `public` tiene RLS habilitado—.

**Hoy no hay tablas y la prueba pasa sin comprobar nada. Ese es el momento correcto
de escribirla:** desde la primera migración de la fase 2, olvidar
`enable row level security` rompe la suite en lugar de pasar inadvertido.
Escribirla después sería escribirla mirando lo que hay en vez de lo que debería
haber.

**Probada en los tres estados.** Tabla sin RLS: falla y **nombra la tabla**. La
misma tabla con RLS: pasa. Sonda retirada: pasa. El segundo paso es el que da valor
al primero — sin él, la prueba podría estar detectando simplemente «existe una
tabla» y habría pasado por buena.

### LEX-1.8 — Clientes Supabase SSR — `HECHO`

Informe completo en [`evidence/LEX-1.8.md`](evidence/LEX-1.8.md).

Tres clientes: navegador, servidor —con `server-only`— y renovación de sesión en el
proxy. Patrón oficial consultado en la documentación, no escrito de memoria.

**Ningún cliente privilegiado.** Los tres usan la misma clave publishable. La
identidad la aporta la cookie; los permisos los decide RLS. Corolario incómodo pero
necesario: esa clave está en el bundle que descarga cualquiera, así que **una tabla
sin políticas queda abierta a Internet**, no protegida por la interfaz.

**`getSession()` prohibido por lint.** Devuelve lo que diga la cookie sin verificar
su firma; confiar en ella para decidir permisos es preguntarle al visitante quién
dice ser y creerle. No lo dejé como norma escrita: una regla lo rechaza en todo
`src/`, y una excepción legítima tendrá que justificarse en el diff.

**El proxy encadena dos pasos y el orden importa.** El idioma primero —puede
redirigir—, y la sesión se renueva sobre esa misma respuesta. Crear una respuesta
nueva descartaría la decisión de idioma, con un síntoma sutil: sesión renovada,
usuario en el idioma que no eligió.

**Dos barreras, comprobadas por separado.** La regla de capas salta antes que
`server-only`; para probar la segunda hubo que esquivar la primera poniendo la sonda
dentro de `infrastructure/`. Comprobar solo la primera no habría bastado: quien
escribe código de infraestructura no está cubierto por ella.

Los 12 tests E2E siguen en verde con el proxy modificado.

### LEX-1.7 — Supabase local — `HECHO`. Cierra Q-003.

Informe completo en [`evidence/LEX-1.7.md`](evidence/LEX-1.7.md).

**El bloqueo no era configuración.** Docker Desktop estaba en la 4.18.0, de marzo
de 2023, sobre un WSL con kernel de 2026. `dockerd` moría al instante y su registro
solo contenía `EOF`: ni una línea de error, que es la firma de una incompatibilidad
de binarios. Actualizado a 4.88.1 por Joan; el motor arranca en 30 segundos.

CLI de Supabase 2.116.0 **como dependencia del proyecto**, no global. Scripts
`db:start`, `db:stop`, `db:status`, `db:reset` y `db:types`.

Variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
añadidas al esquema de **cliente**: la clave publishable está pensada para vivir en
el navegador, porque quien concede permisos es RLS dentro de PostgreSQL. **La clave
secreta no está en ninguna parte del repositorio**, ni comentada.

`database.types.ts` generado y excluido de los formateadores. Se regenera en el
mismo commit que la migración que lo cambia; separarlos hace que el compilador
apruebe consultas que la base rechazará.

**Dos incidencias registradas porque volverán a pasar:** el primer `supabase start`
y el primer `db reset` fallaron y funcionaron al reintentar sin cambiar nada
—contenedores asentándose tras la primera descarga—. Y un test falló bajo carga,
con la puesta en marcha de jsdom tardando 45 s en vez de menos de uno; tiempos
límite subidos a 15 s y 30 s, con el motivo escrito.

### LEX-1.11 — Configurar Playwright — `HECHO`

Informe completo en [`evidence/LEX-1.11.md`](evidence/LEX-1.11.md).

Dos perfiles: escritorio y **Poco F5 real** —393×873 px CSS, densidad 2.75—, no un
móvil genérico. Los fallos responsive aparecen en anchos concretos, y probar en 375
no dice nada sobre el teléfono donde esto se va a usar.

Se prueba contra el **build de producción**, no contra el servidor de desarrollo:
difieren en renderizado estático y manejo de errores.

**12 tests en verde**, 6 casos por 2 dispositivos: idiomas con su `lang`,
redirección de la raíz, 404 en idioma inexistente, conmutador de idioma, tema que
sobrevive a una recarga y ausencia de errores de consola.

**`exactOptionalPropertyTypes` atrapó un error real.** `workers: undefined` no
compila: la opción distingue omitir una clave de asignarle `undefined`, y Playwright
no acepta lo segundo. Corregido omitiéndola. Una opción estricta activada en
LEX-1.2 pillando un fallo concreto a la semana siguiente.

### LEX-1.9 — Vitest y React Testing Library — `HECHO`

Informe completo en [`evidence/LEX-1.9.md`](evidence/LEX-1.9.md).

Vitest 4.1.11 con entorno `node` por defecto y `jsdom` a petición: la mayor parte
del código de Lexora no necesita un DOM y levantarlo en cada fichero cuesta tiempo
en cada ejecución.

**Cierra la deuda de LEX-1.3.** La regla de dependencia entre capas estaba
comprobada a mano, lo que demuestra que funcionaba aquel día pero no impide que un
cambio futuro la desactive en silencio. Ahora
`tests/unit/architecture/layer-rules.test.ts` ejecuta ESLint sobre código que la
viola y exige que falle. Once casos, incluidos los que **deben** pasar.

**El test de regresión se probó rompiendo la regla.** Uno que nunca ha fallado no
está probado:

```text
Regla neutralizada:   4 failed | 10 passed
Regla restaurada:    14 passed
```

Fallan exactamente los cuatro casos del dominio y ninguno más.

El primer intento de neutralizarla **no funcionó** —creé una clave duplicada y en
un literal de JavaScript gana la última—, y los tests siguieron pasando. Un
experimento que sale bien cuando esperabas que fallara es la señal de que el
experimento está mal.

**`test` añadido a `pnpm check`**, lo que salda la desviación registrada en
LEX-1.2. Y una dependencia menos: `vite-tsconfig-paths` era redundante, Vite ya
resuelve los alias de forma nativa.

### LEX-1.6 — Sistema visual base — `HECHO`

Informe completo en [`evidence/LEX-1.6.md`](evidence/LEX-1.6.md).

Tokens en oklch nombrados por su papel, no por su aspecto. Temas claro, oscuro y
seguir-al-sistema. Tres componentes base: `Button`, `Input`, `Label`.

**El contraste se comprueba, no se afirma.** `scripts/check-contrast.mjs` lee los
tokens del propio CSS, convierte a sRGB y calcula la relación WCAG. Se
autocomprueba antes de nada: si blanco/negro no da 21:1, aborta, porque un informe
con la matemática mal da confianza falsa.

**Encontró un fallo real.** `--color-border-strong` daba 1.81:1 en claro y 2.26:1
en oscuro, muy por debajo del mínimo de 3:1 que WCAG exige a los componentes. A ojo
parecía correcto en ambos temas. Corregido; las 18 combinaciones pasan. Queda
integrado en `pnpm check`, así que un cambio de paleta que rompa el contraste falla
la CI.

**Sin destello de tema.** Script síncrono en el `<head>`, verificado sobre el HTML
servido: posición 1494, `<body>` en 1914.

**Una regla de lint tenía razón.** La primera versión leía `localStorage` en un
efecto y llamaba a `setState`; el compilador de React lo rechazó. En vez de
silenciarlo, se reescribió con `useSyncExternalStore`, que es la API para esto. De
paso arregló algo que no se buscaba: cambiar el tema en una pestaña ahora se
refleja en las demás.

### LEX-1.5 — Internacionalización ES/EN — `HECHO`

Informe completo en [`evidence/LEX-1.5.md`](evidence/LEX-1.5.md).

`next-intl@4.14.0` con enrutado por prefijo. En Next.js 16 el archivo de
middleware se llama `src/proxy.ts`. Los textos viven en `messages/`, ninguno
dentro de un componente.

**Comprobado en ejecución**, con el servidor arrancado:

```text
/es   HTTP 200   lang="es"   texto en español
/en   HTTP 200   lang="en"   texto en inglés
/     HTTP 307   redirige al idioma por defecto
/fr   HTTP 404   no una página en blanco
```

`lang` no es cosmético: los lectores de pantalla lo usan para elegir la voz. Una
página en español anunciada como `lang="en"` se lee con acento inglés.

**La separación de los cuatro idiomas está en el código, no solo en el glosario.**
El tipo se llama `UiLocale` y no `Locale` a propósito: el nombre corto invitaría a
reutilizarlo para el idioma estudiado, que es justo el error a evitar.

**Scripts de instalación denegados.** `next-intl` arrastró `@parcel/watcher` y
`@swc/core`, y pnpm exigió decidir. Los cuatro de la lista quedan a `false`: un
`postinstall` ejecuta código de terceros durante `pnpm install`, aquí y en la CI.
Comprobado que el build pasa sin ninguno. El razonamiento está escrito junto a la
lista.

### LEX-1.4 — Validación de entorno con Zod — `HECHO`

Informe completo en [`evidence/LEX-1.4.md`](evidence/LEX-1.4.md).

`src/env/` valida el entorno **al cargar el módulo**, no en la primera petición que
use la variable: es preferible que la aplicación no arranque a que arranque mal.
Servidor y cliente en módulos separados; `src/env/server.ts` importa `server-only`.
`.env.example` documentado, sin un solo valor real.

**La separación se comprobó, no se dio por hecha.** Un error aquí no da un fallo
visible, da una clave publicada:

1. Se metió una variable de servidor con un valor reconocible, se consumió desde un
   Server Component y se construyó: **no aparece en `.next/static` ni en ningún
   artefacto del build.**
2. Se creó un componente `"use client"` que la importaba: **el build falla** con la
   traza de importación completa, señalando quién provocaba la fuga.

Ambas sondas retiradas; `pnpm check` en verde después.

**Un choque resuelto sin rendirse.** `noPropertyAccessFromIndexSignature` obliga a
`process.env["X"]`, pero Next.js sustituye `process.env.X` de forma textual. En vez
de desactivar la opción, `src/env/env.d.ts` declara las variables públicas como
propiedades reales. Las de servidor **no** se declaran, a propósito: obliga a
escribirlas de otra forma y eso recuerda que no son intercambiables.

Solo hay dos variables todavía. Es correcto: el entregable es el mecanismo. Las de
Supabase llegan en LEX-1.7, cuando existan de verdad.

### LEX-1.3 — Estructura modular y reglas de dependencia — `HECHO`

Informe completo en [`evidence/LEX-1.3.md`](evidence/LEX-1.3.md).

**La regla de dependencia de ADR-001 ya no es solo documentación: falla el lint.**
Tres grupos de reglas `no-restricted-imports` impiden que `domain` importe React,
Next.js, Supabase, `ts-fsrs` o cualquier otra capa; que `application` toque
infraestructura o presentación; y que un componente o una ruta llame a un
repositorio. Cada mensaje de error explica el porqué y cita el ADR.

**Probada rompiéndola:** se crearon tres ficheros con violaciones deliberadas y el
lint detectó las cuatro, tanto en forma relativa como con el alias `@/`. Después se
retiraron. La salida exacta está en el informe.

**No se han creado 32 carpetas vacías.** Los módulos se crean cuando se
implementan; `src/modules/README.md` documenta cuáles existirán y en qué fase, y
`src/shared/README.md` fija el criterio para promover algo a compartido: que lo
necesiten dos módulos ya, no que probablemente haga falta.

### LEX-1.2 — Calidad base y scripts canónicos — `HECHO`

Informe completo en [`evidence/LEX-1.2.md`](evidence/LEX-1.2.md).

Scripts: `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `check`, más
los de Next. **`typecheck` ejecuta `next typegen` antes de `tsc`**, que es el
arreglo del hallazgo de LEX-1.1.

TypeScript endurecido sobre `strict`: `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`noPropertyAccessFromIndexSignature` y `forceConsistentCasingInFileNames` —esta
última porque la CI corre en Linux y Windows no distingue mayúsculas—. `target`
subido a `ES2022`, que cubren todos los navegadores que Next.js documenta.

Prettier 3.9.6 con `eslint-config-prettier`. Reglas propias: `no-explicit-any` como
error, `no-unused-vars` con excepción para `_`, `no-console` como aviso.

**Markdown excluido del formateador, tras probarlo.** Prettier alinea las tablas
rellenando con espacios: un cambio de tres líneas en `STATUS.md` producía un diff
de 134. El código se formatea; la documentación se escribe a mano.

**ESLint 10 probado y descartado.** Toda la línea 9.x está fuera de soporte, lo que
justificaba intentarlo, pero `eslint-plugin-react` —que arrastra
`eslint-config-next`— usa una API que la 10 eliminó y el lint revienta. Se vuelve a
9.39.5. Deuda registrada más abajo.

### LEX-1.1 — Aplicación Next.js con App Router — `HECHO`

Informe completo en [`evidence/LEX-1.1.md`](evidence/LEX-1.1.md).

| Paquete | Versión |
|---|---|
| Next.js | 16.3.3 (Turbopack por defecto) |
| React / React DOM | 19.2.8 |
| TypeScript | 5.9.3, `strict: true` |
| ESLint | 9.39.5 con `eslint-config-next` |
| Tailwind CSS | 4.3.3 |

**Verificado, no supuesto.** En el árbol de trabajo: `pnpm install`, `pnpm lint`,
`pnpm build` y `tsc --noEmit` en verde; el servidor de desarrollo responde HTTP 200
con HTML renderizado. Y en un **clon limpio** desde cero:
`pnpm install --frozen-lockfile`, `build`, `tsc --noEmit` y `lint`, los cuatro en
verde.

**Dos hallazgos que afectan a tareas posteriores:**

1. `tsc --noEmit` **falla en un clon limpio** hasta que Next genera los tipos de
   rutas: el layout raíz usa `LayoutProps`, que vive en `.next/types/`. La CI
   (LEX-1.12) y los scripts (LEX-1.2) deben ejecutar `next typegen` antes de la
   comprobación de tipos.
2. `next dev` **añade por su cuenta un bloque a `CLAUDE.md`**. Se conserva y se
   enmarca: borrarlo solo consigue que reaparezca y deje el árbol sucio.

**Decisión:** no se adopta TypeScript 7.0.2, la reescritura nativa. Next.js
documenta un mínimo de 5.1 y no la menciona; adoptarla ahora sería riesgo sin
contrapartida.

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

| Tarea | Estado | Nota |
|---|---|---|
| LEX-0.3 — `CLAUDE.md` operativo completo | `PENDIENTE` | Desbloqueada por Q-001. Existe una versión mínima que ampliar. |
| LEX-0.4 — ADR-001…004 | `PENDIENTE` | Desbloqueada por Q-002: los ADR son públicos. |
| LEX-0.5 — `ARCHITECTURE.md`, `DATA_MODEL.md`, `FSRS.md` | `PENDIENTE` | Desbloqueada por Q-002: públicos. |
| LEX-0.6 — Workflow, versionado y entornos | `PENDIENTE` | Sin dependencias abiertas. |
| LEX-0.7 — Nomenclatura y política de contenido | `PENDIENTE` | Sin dependencias abiertas. |
| LEX-0.8 — Auditar M0 y checkpoint versionado | `PENDIENTE` | Depende de Q-004 (push). |

---

## Archivos y migraciones afectados

| Archivo | Cambio |
|---|---|
| `.gitignore` | Reescrito para repositorio público. |
| `README.md` | Creado. Presentación, modelo conceptual, stack y alcance. |
| `CLAUDE.md` | Ampliado al protocolo operativo completo. |
| `docs/STATUS.md` | Creado. |
| `docs/OPEN_QUESTIONS.md` | Creado. Q-001…Q-004. |
| `docs/evidence/README.md` | Creado. Convención `LEX-n.m.md`. |
| `docs/adrs/README.md` | Creado. Índice, formato y reglas de los ADR. |
| `docs/adrs/ADR-001…004` | Creados. Decisiones estructurales de la V1. |
| `docs/ARCHITECTURE.md` | Creado. |
| `docs/DATA_MODEL.md` | Creado. |
| `docs/FSRS.md` | Creado. |
| `docs/WORKFLOW.md` | Creado. |
| `.nvmrc` | Creado. Fija Node 24.19.0 en local. |
| `.gitattributes` | Creado. Normaliza finales de línea a LF. |
| `docs/GLOSSARY.md` | Creado. |
| `docs/CONTENT_POLICY.md` | Creado. |
| `docs/evidence/LEX-0.8.md` | Creado. Informe de auditoría de M0. |
| `docs/evidence/LEX-1.1.md` | Creado. Informe de la aplicación Next.js. |
| `docs/evidence/LEX-1.2.md` | Creado. Informe de calidad y scripts. |
| `.prettierrc.json`, `.prettierignore` | Creados. |
| `eslint.config.mjs` | Reglas propias del proyecto y `eslint-config-prettier`. |
| `tsconfig.json` | Seis opciones estrictas añadidas; `target` a ES2022. |
| `docs/WORKFLOW.md` | Sección de scripts canónicos. |
| `docs/evidence/LEX-1.3.md` | Creado. Informe de las reglas de dependencia. |
| `src/modules/README.md`, `src/shared/README.md` | Creados. Convención de módulos y capas. |
| `docs/ARCHITECTURE.md` | Anotado que la regla de dependencia es exigible por lint. |
| `docs/evidence/LEX-1.4.md` | Creado. Informe de validación de entorno. |
| `src/env/` | Creado: `server.ts`, `client.ts`, `shared.ts`, `env.d.ts`. |
| `.env.example` | Creado. Plantilla documentada sin valores reales. |
| `CLAUDE.md` | Aviso: no editar textos en español con `Set-Content` de PowerShell. |
| `docs/evidence/LEX-1.5.md` | Creado. Informe de internacionalización. |
| `src/i18n/`, `src/proxy.ts`, `messages/` | Creados. |
| `src/app/[locale]/` | Layout y página movidos bajo el segmento de idioma. |
| `pnpm-workspace.yaml` | Scripts de instalación denegados, con el motivo escrito. |
| `docs/evidence/LEX-1.6.md` | Creado. Informe del sistema visual. |
| `src/app/globals.css` | Reescrito: tokens, temas y accesibilidad base. |
| `src/shared/presentation/theme/` | Creado. Script sin destello, almacén y selector. |
| `src/shared/presentation/components/` | Creado. `Button`, `Input`, `Label`. |
| `scripts/check-contrast.mjs` | Creado. Comprobación WCAG ejecutable. |
| `docs/evidence/LEX-1.9.md` | Creado. Informe del arnés de tests. |
| `vitest.config.mts`, `vitest.setup.ts` | Creados. |
| `tests/unit/architecture/layer-rules.test.ts` | Creado. Regresión de la regla de dependencia. |
| `src/shared/presentation/components/button.test.tsx` | Creado. Prueba el arnés de componentes. |
| `docs/evidence/LEX-1.11.md` | Creado. Informe de Playwright. |
| `playwright.config.ts`, `tests/e2e/landing.spec.ts` | Creados. |
| `docs/evidence/LEX-1.7.md` | Creado. Informe de Supabase local. |
| `supabase/config.toml`, `supabase/seed.sql` | Creados. |
| `src/shared/infrastructure/supabase/` | Creado. Tipos generados y su README. |
| `src/env/client.ts`, `.env.example` | Variables de Supabase añadidas. |
| `vitest.config.mts` | Tiempos límite subidos, con el motivo escrito. |
| `docs/evidence/LEX-1.8.md` | Creado. Informe de los clientes SSR. |
| `src/shared/infrastructure/supabase/{browser,server}-client.ts`, `session.ts` | Creados. |
| `src/proxy.ts` | Encadena idioma y renovación de sesión. |
| `eslint.config.mjs` | Regla que prohíbe `getSession()`. |
| `docs/evidence/LEX-1.10.md` | Creado. Informe del arnés de base de datos. |
| `supabase/tests/database/` | Creado. Arnés pgTAP e invariante de RLS. |
| `docs/evidence/LEX-1.12.md` | Creado. Informe de la CI. |
| `.github/workflows/ci.yml` | Creado. Tres trabajos. |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Creados. Versiones fijadas. |
| `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs` | Creados. |
| `src/app/`, `public/` | Creados por el andamiaje. La página de ejemplo se sustituye en LEX-1.13. |
| `.gitignore` | Ampliado con lo que necesita Next.js. |
| `CLAUDE.md` | Bloque gestionado por `next dev`, conservado y enmarcado. |
| `README.md` | Actualizado: enlaces a las tres specs técnicas. |
| `docs/no_visible_en_github/` | Reservado para `MASTER_SPEC.md`, `ROADMAP.md` y material privado. |

Migraciones SQL: ninguna. Todavía no existe base de datos.

---

## Verificaciones ejecutadas y resultados

### Entorno de desarrollo

| Herramienta | Estado | Versión |
|---|---|---|
| Git | Presente | 2.39.0.windows.2 |
| Node.js | Presente | **24.19.0**, gestionado con nvm-windows |
| npm | Presente | 11.17.0 |
| corepack | Presente | 0.34.6 |
| pnpm | Presente | 11.24.0, vía corepack |
| Docker CLI | Presente | 20.10.24 |
| Docker | Operativo | Desktop 4.88.1, motor 29.7.2, 12 CPU, 8 GB |
| CLI de Supabase | Presente | 2.116.0, dependencia del proyecto |

### Estado de Git en la inspección inicial

```text
git status --short --branch
## main

git log --oneline
8d45f29 chore: initialize repository with gitignore
```

### Exclusiones comprobadas

```text
git check-ignore -v docs/no_visible_en_github/MASTER_SPEC.md
.gitignore:12:no_visible_en_github/   docs/no_visible_en_github/MASTER_SPEC.md
```

### Gates de calidad

**Ninguno aplica todavía.** No existe `package.json`, por lo que `pnpm lint`,
`pnpm typecheck`, `pnpm test` y `pnpm build` no pueden ejecutarse. Esperado en FASE 0.

---

## Verificaciones manuales pendientes

Corresponden a Joan:

1. **Q-003** — Node y pnpm ya resueltos. Queda **Docker Desktop**: abrir su ventana y ver qué está pidiendo. No bloquea LEX-1.1.
2. **Q-004** — autorizar `git push -u origin main` y confirmar que el remoto está vacío.
3. Asegurar una copia de seguridad de `docs/no_visible_en_github/` fuera del proyecto: Git no protege esos archivos.

---

## Bloqueos y preguntas

| ID | Asunto | Estado | Bloquea |
|---|---|---|---|
| Q-001 | Visibilidad de `CLAUDE.md` | `RESUELTA` — público | — |
| Q-002 | Qué documentación es pública | `RESUELTA` — privado el diseño, público el método | — |
| Q-003 | Herramientas de desarrollo | `RESUELTA` | — |
| Q-004 | Primer push al remoto público | `RESUELTA` | — |

Ninguna impide continuar con LEX-0.3 a LEX-0.7.

---

## Riesgos o deuda conocida

- **Al mover o renombrar una ruta, `pnpm typecheck` falla hasta borrar `.next`.**
  Los tipos generados describen el árbol anterior y se quejan de ficheros que ya no
  existen. No es un error del código: es caché. La CI no lo sufre porque parte de
  un árbol limpio.


- **ESLint corre sobre una línea sin soporte (9.39.5).** No recibirá correcciones de
  seguridad. Bloqueante: `eslint-plugin-react` no soporta ESLint 10. Riesgo bajo —es
  una herramienta de desarrollo, no se despliega y no procesa entrada no confiable—.
  Revisar al actualizar Next.js o antes de LEX-9.9. Para comprobarlo:
  `pnpm add -D eslint@10 && pnpm lint`.

- **El repositorio es público desde el primer commit.** Cualquier archivo confirmado
  una sola vez queda permanentemente en el historial y en los forks, aunque se borre
  después. Comprobar `git status` antes de cada commit.
- **`MASTER_SPEC.md` y `ROADMAP.md` quedan fuera de Git:** sin historial, sin copia de
  seguridad y sin revisión por PR. Riesgo real de pérdida por borrado accidental.
- El remoto `origin` está configurado pero no verificado: no se sabe si está vacío.
- `MASTER_SPEC.md` §22 sigue redactada suponiendo que toda la documentación se
  versiona. La desviación está registrada en Q-002 y en el registro de cambios del
  roadmap, no propagada en silencio.
- Sin `LICENSE`. Repositorio público sin licencia = todos los derechos reservados
  por defecto. Debe decidirse antes de la publicación de la V1 (LEX-10.10).

---

## Siguiente acción exacta

Ejecutar **LEX-1.13** — landing mínima y health check. Sustituir la página de
demostración por una landing real y añadir un punto de comprobación que confirme
que la aplicación responde y alcanza la base de datos.

Después, **LEX-1.14** cierra el hito M1: verificar que un clon limpio instala,
levanta, prueba y compila con los comandos documentados.

Sin bloqueos ni preguntas abiertas.

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

- Rama: `main`.
- Remoto: `origin` → `https://github.com/JoanOliver04/lexora.git` (**público**, configurado, sin push ni fetch).
- Contenido versionado: `.gitignore`, `README.md`, `CLAUDE.md`, `docs/STATUS.md`,
  `docs/OPEN_QUESTIONS.md`, `docs/evidence/README.md`, `docs/ARCHITECTURE.md`,
  `docs/DATA_MODEL.md`, `docs/FSRS.md` y `docs/adrs/` con cinco archivos.
