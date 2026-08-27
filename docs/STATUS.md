# Lexora — Estado actual

**Última actualización:** 2026-08-27
**Fase actual:** FASE 1 — Fundación técnica — `EN PROCESO` (5/14)
**Hito actual:** M1 — Fundación técnica reproducible — `EN PROCESO`
**Tarea activa:** ninguna
**Estado de la tarea:** FASE 0 completa (LEX-0.1…0.8) · **LEX-1.1 a LEX-1.5 `HECHO`**
**Rama / commit base / HEAD:** `main` / `4a628be` (`v0.1.0-m0`) / ver «Estado de git»

> El roadmap detallado y la especificación maestra son documentos privados y
> locales; no forman parte de este repositorio público. Ver
> [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) Q-002.

---

## Terminado en esta sesión

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
| Docker daemon | **No responde** | La aplicación arranca y WSL 2 corre, pero el motor no expone su tubería. Ver Q-003 |
| Supabase CLI | Pendiente | Se instalará como dependencia del proyecto en LEX-1.7 |

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
| Q-003 | pnpm, Docker y Supabase CLI | `ABIERTA` | LEX-1.1, LEX-1.7 |
| Q-004 | Primer push al remoto público | `ABIERTA` | LEX-0.8 |

Ninguna impide continuar con LEX-0.3 a LEX-0.7.

---

## Riesgos o deuda conocida

- **Al mover o renombrar una ruta, `pnpm typecheck` falla hasta borrar `.next`.**
  Los tipos generados describen el árbol anterior y se quejan de ficheros que ya no
  existen. No es un error del código: es caché. La CI no lo sufre porque parte de
  un árbol limpio.

- **La regla de dependencia no tiene regresión automática.** Se ha verificado a
  mano y la salida está registrada, pero nada impide que un cambio futuro en
  `eslint.config.mjs` la desactive sin que se note. Cerrar en LEX-1.9 con un test
  que ejecute ESLint sobre fixtures y espere los errores.

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
- Docker no operativo impide validar el flujo de Supabase local.
- `MASTER_SPEC.md` §22 sigue redactada suponiendo que toda la documentación se
  versiona. La desviación está registrada en Q-002 y en el registro de cambios del
  roadmap, no propagada en silencio.
- Sin `LICENSE`. Repositorio público sin licencia = todos los derechos reservados
  por defecto. Debe decidirse antes de la publicación de la V1 (LEX-10.10).

---

## Siguiente acción exacta

Ejecutar **LEX-1.6** — sistema visual base: tokens de color, espacio, radio,
tipografía y elevación; temas claro, oscuro y sistema; y los componentes mínimos
sobre los que se construirá el resto.

Es la última tarea de FASE 1 que no necesita Docker. Después, **LEX-1.7 exige
resolver Q-003**.

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
