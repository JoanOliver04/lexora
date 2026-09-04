# LEX-3.5 — CRUD y archivado de mazos

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-5-deck-crud`
**Estado resultante:** `EN PROCESO` → `HECHO` al fusionar con CI verde.

---

## 1. Alcance

Primeras pantallas de la biblioteca: lista de mazos del curso activo y
detalle/edición de un mazo, sobre `getLibraryContextForCurrentUser()` y los
casos de uso de `deck.ts` (LEX-3.4). **Sin migración.** `db:test` sin cambios
(240); `db:types` limpio.

Cubierto: crear, renombrar, describir, categorizar, fijar nivel, **reordenar**
(subir/bajar) y archivar/restaurar un mazo; recuentos de conceptos por mazo;
estados vacíos (curso sin mazos, mazo sin conceptos); UI ES/EN.

**Fuera de alcance, declarado:**

- **Gestión de la pertenencia mazo↔concepto** (añadir/quitar conceptos de un
  mazo) → hasta que existan conceptos, LEX-3.6. `addConceptToDeck` /
  `removeConceptFromDeck` ya están en el puerto desde LEX-3.4; la pantalla que
  los usa es de 3.6+.
- **Búsqueda, filtros y paginación** → LEX-3.9. La lista actual carga todos los
  mazos del curso (N+1 consciente en los recuentos, ver §6).
- **Reordenar arrastrando** → no es de la V1; subir/bajar de a uno basta.

## 2. Forma

### Ruta

`src/app/[locale]/(app)/decks/`:

| Archivo | Qué es |
|---|---|
| `page.tsx` | Lista (Server Component). Lee curso activo + `listDecks` + recuento por mazo. Formularios de mover/archivar en la fila; alta abajo. `?archived=1` incluye los archivados. |
| `[deckId]/page.tsx` | Detalle/edición (Server Component). Lee la lista **con** archivados y busca por id (`DeckRepository` no tiene `get`, LEX-3.4); `notFound()` si no aparece. Recuento de conceptos + archivar/restaurar. |
| `actions.ts` | Server Actions delgadas (`"use server"`). `createDeckAction` / `updateDeckAction` (con `useActionState`), `setDeckArchivedAction` / `moveDeckAction` (acción de formulario a secas). |
| `create-deck-form.tsx`, `edit-deck-form.tsx` | Cliente. Patrón de `OnboardingForm`: `useActionState`, `FormError`, `useFocusFirstInvalid`, `PendingButton`. |
| `deck-fields.tsx` | Cliente. Campos compartidos (nombre, descripción, nivel, categoría). `<textarea>` y `<select>` estilados con los tokens de `Input`. |
| `message-key.ts` | `deckIssueKey`: `deck.title.empty` → `title_empty` (mismo puente que el onboarding; `.` en la clave rompería el anidado de next-intl). |

La **puerta de onboarding sigue por página** (deuda de LEX-2.9). Con esta tarea
`(app)` pasa de dos a cuatro rutas y la condición que el comentario de
`app/page.tsx` nombraba —«cuando `(app)` tenga más de dos rutas»— se cumple: las
dos redirecciones (`hasCompletedOnboardingForCurrentUser` → `/onboarding`;
`getActiveCourseForCurrentUser()` nulo → `/onboarding`) se repiten en las dos
páginas nuevas para que un usuario sin curso no llegue a una pantalla cuyo
`courseId` sería nulo. Centralizarla en el layout (necesita el `pathname`, que
un layout de Server Component no tiene a mano) sigue pendiente — **deuda
explícita ahora que la condición ha disparado.**

### Reordenación en bloque (lo que LEX-3.4 dejó fuera)

- **Puerto:** `DeckRepository.reorder({ ownerId, courseId, deckIds })` — reescribe
  `position = 0..n-1` en el orden recibido. Solo toca filas del par
  `(ownerId, courseId)`.
- **Caso de uso:** `reorderDecks(repository, ownerId, courseId, orderedDeckIds)`
  — comprueba `ownerId` vacío y delega, como el resto de `deck.ts`.
- **Adaptador:** N `update` sueltos (`Promise.all`). `decks.position` no tiene
  índice único (LEX-3.2), así que no colisionan entre sí. **No es atómico**: un
  fallo a mitad deja el orden a medias — aceptable para un reordenado de la
  interfaz (deuda anotada en §6).
- **Alta al final:** `create` consulta `max(position)` del curso e inserta con
  `max + 1`. Sin esto, un mazo nuevo caería en el default `0` y, tras cualquier
  reordenación que normaliza a `0..n-1`, quedaría empatado arriba en lugar de al
  final. No es atómico frente a dos altas simultáneas (colisión benigna: la
  siguiente reordenación lo sanea).
- **Interfaz:** botones «Subir»/«Bajar» por fila (deshabilitados en los
  extremos). `moveDeckAction` lee el orden actual (`listDecks`), intercambia el
  mazo con su vecino y llama a `reorderDecks` con la lista completa.

### Errores

- **Dominio** (`DeckIssue`): `deck.title.empty` / `.tooLong`,
  `deck.description.tooLong`, `deck.cefrLevel.invalid`, `deck.category.invalid`
  → `Library.errors.*` vía `deckIssueKey`. Un test
  (`tests/unit/messages/deck-error-keys.test.ts`) afirma que cada clave de la
  unión tiene mensaje en `es` y en `en`, como el del onboarding.
- **Adaptador** (`LibraryError`): se colapsa a `error: "generic"` +
  `console.error`. Para mazos hoy no hay `duplicate`; `parent-missing` /
  `forbidden` no deberían ocurrir (el caso de uso ya trabaja bajo la identidad
  del usuario).

### Revalidación

Cada mutación llama a `revalidatePath(\`/${locale}/decks\`)` (ruta concreta, no
el patrón `/[locale]/...`) **antes** del `redirect`: `force-dynamic` gobierna el
render del servidor, no la caché del router en el cliente. `updateDeckAction`
revalida además `/{locale}/decks/{deckId}`.

### i18n

Namespace `Library` nuevo en `messages/{es,en}.json`: títulos, etiquetas de
campo, nombres de categoría, acciones, `conceptCount` (plural ICU),
distintivo/toggle de archivados, estados vacíos y `errors.*`. El nivel MCER se
pinta en crudo (`A1`…`B2`, independiente del idioma). `App.decksLink` añade el
enlace desde el shell.

### Q-005

El `<select>` de categoría es donde `professional`-como-categoría se hace
**visible al usuario** (opción de la lista, etiqueta «Profesional» / «Professional»).
La interpretación ya está aplicada en la migración de LEX-3.2 y registrada como
**Q-005 (abierta)**; se procede. Revertirla ahora costaría, además de la
migración correctiva, un cambio en esta UI.

## 3. Tests

`pnpm test` → **24 ficheros, 170 tests, PASS** (23 / 166 previos + 1 fichero / 4
nuevos):

| Fichero | Casos nuevos |
|---|---|
| `src/modules/library/application/deck.test.ts` | +2 — `reorderDecks` delega el orden completo; rechaza `ownerId` vacío. |
| `tests/unit/messages/deck-error-keys.test.ts` | +2 — `deckIssueKey` transforma la clave; cada `DeckIssue` tiene mensaje en `es` y `en`. |

`tests/unit/messages/parity.test.ts` (sin cambios) camina el árbol entero y ya
cubre el namespace `Library`: claves `es`↔`en` y ningún valor vacío.

**E2E** `tests/e2e/decks.spec.ts` (nuevo), 3 casos × 2 dispositivos:

1. **crear, renombrar y archivar** — desde el shell (`Mis mazos`), estado vacío,
   crear → aparece en la lista con «Sin conceptos», renombrar desde el detalle →
   nuevo nombre en la lista, archivar → **sale** de la lista por defecto,
   `Ver archivados` → vuelve a aparecer con el distintivo «Archivado».
2. **alta al final + reordenar** — dos altas; la segunda queda **debajo** de la
   primera (`append`); «Bajar» en la primera intercambia el orden.
3. **validación** — alta sin nombre → no se crea, mensaje «Escribe un nombre
   para el mazo.», `aria-invalid="true"` en el campo.

Aislamiento A/B **no se repite**: lo cubre pgTAP `090` (LEX-3.3).

**Adaptador `supabase-deck-repository`:** sin test unitario propio (patrón de la
casa). El mapeo fila↔dominio, `create` con `append`, `reorder` y
`setArchived`/`update` se ejercitan de punta a punta contra el stack local en
`decks.spec.ts`.

## 4. Verificación por rotura

- **Regla de capas (ruta de presentación).** `import` de
  `@/modules/library/infrastructure/supabase-deck-repository` en
  `src/app/[locale]/(app)/decks/actions.ts` → `pnpm lint` falla: «La
  presentacion llama a un caso de uso, no a un repositorio (ADR-001). Nada de
  SQL ni de clientes de base de datos en un componente o una ruta». Revertido.
- **Guarda de identidad de `reorderDecks`.** Quitar `assertUserId(ownerId)` del
  caso de uso → falla **solo** `deck.test.ts › reorderDecks › rechaza un
  identificador de usuario vacío` (20/21 en el fichero). Restaurado.

## 5. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 24 ficheros/170, build)
pnpm db:test   10 ficheros / 240 asserciones, PASS (sin cambios: LEX-3.5 no toca SQL)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       52 passed (escritorio + Poco F5); decks.spec ×6 nuevos
```

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/library/application/deck.ts` | Puerto `reorder` + caso de uso `reorderDecks`. |
| `src/modules/library/application/deck.test.ts` | +2 casos (`reorderDecks`). |
| `src/modules/library/infrastructure/supabase-deck-repository.ts` | `create` inserta con `position = max + 1`; método `reorder` (N `update`). |
| `src/app/[locale]/(app)/decks/{page,actions,create-deck-form,edit-deck-form,deck-fields,message-key}.tsx?` | Nuevos. Lista + detalle + acciones + formularios. |
| `src/app/[locale]/(app)/decks/[deckId]/page.tsx` | Nuevo. Detalle/edición. |
| `src/app/[locale]/(app)/app/page.tsx` | Enlace `Mis mazos` a `/decks`. |
| `messages/{es,en}.json` | Namespace `Library`; `App.decksLink`. |
| `tests/unit/messages/deck-error-keys.test.ts` | Nuevo. |
| `tests/e2e/decks.spec.ts` | Nuevo. |
| `docs/evidence/LEX-3.5.md` | Este informe. |

Migraciones: **0**. `docs/DATA_MODEL.md` sin cambios (el esquema no se toca).

## 7. Riesgos y deuda

- **N+1 en los recuentos de la lista:** un `listDeckConcepts` por mazo. Con los
  pocos mazos de un curso en la V1 es asumible; las consultas paginadas sin N+1
  son LEX-3.9.
- **`reorder` y `create` no son atómicos.** `reorder` son N `update` sin
  transacción (un fallo a mitad deja el orden a medias); `create` lee
  `max(position)` y luego inserta (dos altas simultáneas pueden empatar). Ambas
  colisiones se sanean con la siguiente reordenación. Un `rpc` transaccional se
  añadiría si el uso real lo pide.
- **`DeckRepository` no tiene `get` por id:** el detalle lee la lista completa y
  filtra. Coste asumible hoy; un `get` dedicado dependería de LEX-3.9.
- **Puerta de onboarding por página** en cuatro rutas ya: centralizar en el
  layout sigue pendiente (necesita el `pathname`).
- **Q-005 abierta** y ahora visible en la UI (categoría «Profesional»).
- Deuda arrastrada: revisión cruzada independiente §3.6 (aquí, la primera capa
  de presentación de biblioteca). Sin segundo agente.

## 8. Estado del árbol Git

Rama `feat/lex-3-5-deck-crud` desde `main` (`a7d7e85`). Pendiente: commit, PR
contra `main`, CI verde en los tres trabajos, merge, CI verde en `main`, cierre
docs.

## 9. Siguiente tarea

**LEX-3.6** — CRUD de conceptos: título, resumen, explicación, ejemplo, nivel,
tipo, fuente, notas y tags validados; la edición conserva la identidad. Depende
de LEX-3.4. No se inicia aquí.
