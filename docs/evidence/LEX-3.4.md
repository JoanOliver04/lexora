# LEX-3.4 — Repositorios y casos de uso de la biblioteca

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-4-library-repositories` (PR #29, merge `c7b0871`)
**Estado resultante:** `HECHO`

---

## 1. Alcance

Capas `application/` e `infrastructure/` del módulo `library`, sobre el dominio
(LEX-3.1), el esquema (LEX-3.2) y la RLS (LEX-3.3). **Sin migración.**
`db:test` sin cambios (240); `db:types` limpio.

**Fuera de alcance, declarado:**

- **Pantallas y Server Actions** → LEX-3.5 (mazos), 3.6 (conceptos), 3.7
  (ítems + dirección inversa), 3.11 (previsualización).
- **Búsqueda, filtros y paginación** → LEX-3.9.
- **Sugerencia de duplicados** (lectura por `canonical_key`) → LEX-3.10; añadirá
  su propio método al puerto de conceptos.
- **Edición de `concepts.metadata`** → no es de la V1; se deja a su valor por
  defecto (`'{}'`).
- **Reordenar mazos / conceptos en bloque** (`position`) → LEX-3.5; aquí
  `position` se acepta en `addConceptToDeck` pero no hay caso de uso de
  reordenación masiva.

## 2. Forma

Cuatro **puertos**, un fichero por entidad (como `domain/` y como
`courses/application/`): `deck.ts`, `concept.ts`, `practice-item.ts`, `tag.ts`
en `application/`, cada uno con su puerto y sus casos de uso.

**Seis tablas, cuatro puertos.** Las operaciones de enlace viven en el puerto
del agregado, no en un puerto propio: `addConceptToDeck` / `removeConceptFromDeck`
/ `listDeckConcepts` en `DeckRepository`; `tagConcept` / `untagConcept` /
`listConceptTags` / `listConceptsWithTag` en `TagRepository`. No hay pantalla de
`deck_concepts` ni de `concept_tags`.

Cada caso de uso sigue la forma de `completeOnboarding`: comprueba un `ownerId`
vacío (defensa en profundidad), llama al validador de dominio y devuelve
`{ ok: false, issues }` si falla, o delega en el puerto. El `ownerId` sale
siempre de `getClaims()` en la raíz de composición, nunca de un parámetro.

### Validación: dominio para reglas, Zod solo donde §13.9 lo pide

Los validadores de dominio (`validateDeckDraft`, etc., LEX-3.1) ya aceptan
`unknown` de forma defensiva —comprueban que sea un objeto, los tipos de cada
campo, la pertenencia al enum—, así que **no** se apila una capa Zod encima para
mazos, conceptos ni etiquetas.

Zod entra donde §13.9 lo nombra: la **unión discriminada del `config` de los
ítems de práctica** (`practiceItemConfigSchema`). Zod comprueba la *forma*
(¿`mode` es uno de los siete?, ¿`answers` es `string[]`?); el dominio sigue
comprobando las *reglas* (longitudes, en blanco, modo no activable en la V1,
cloze sin soluciones). Ningún esquema Zod referencia una constante de
`taxonomy.ts`: los literales de modo *son* la forma.

### Archivar frente a borrar

`decks`, `concepts` y `practice_items` tienen `archived_at` (LEX-3.2): sus casos
de uso lo alternan con `setArchived(archived)` —no hay `DELETE` físico—.
`tags` y las filas de enlace **sí se borran de verdad** (no tienen historial).

`archived_at` se sella con `new Date().toISOString()` desde el servidor. No
gobierna ningún vencimiento: el reloj inyectado de ADR-003 es para las fechas de
FSRS, no para un sello de auditoría.

### Lecturas: los archivados fuera por defecto

`listDecks` / `listConcepts` / `listPracticeItems` excluyen los archivados salvo
`includeArchived: true`. `listDeckConcepts` y `listConceptsWithTag` excluyen
además los **conceptos** archivados (filtro sobre el recurso embebido).

### Traducción de errores

`libraryErrorFrom` mapea el `code` de PostgREST a un `LibraryError` con `kind`:

| Código | `kind` | Significado |
|---|---|---|
| `23505` | `duplicate` | Choca con el índice único `tags (course_id, normalized_name)` (LEX-3.3). El usuario reescribe. |
| `23503` | `parent-missing` | La FK compuesta rechazó la fila: el padre no existe **o no es del usuario** —indistinguible desde el cliente porque la FK lleva `owner_id`—. |
| `42501` | `forbidden` | RLS rechazó la escritura. No debería ocurrir: el caso de uso ya trabaja bajo la identidad del usuario. Si llega, es un bug. |
| `PGRST116` | `not-found` | Una lectura por id no encontró la fila. |
| resto | `unavailable` | Cualquier otro fallo de infraestructura. |

El `insert` de `concepts` se construye campo a campo y **no** envía
`canonical_key` —columna generada; enviarla falla en ejecución con `428C9`
aunque el tipo generado la marque opcional—.

### Composición

`src/composition/library.ts` expone **un contexto**,
`getLibraryContextForCurrentUser()` → `{ ownerId, decks, concepts, practiceItems, tags }`
(o `null` sin sesión), en vez de veinte funciones
`hacerXParaElUsuarioActual`. Los repositorios se devuelven con el **tipo de
puerto**, no la clase concreta: la presentación (LEX-3.5+) nunca ve
infraestructura.

## 3. Tests

`pnpm test` → **23 ficheros, 166 tests, PASS** (19 / 129 previos + 4 ficheros /
37 nuevos). Mocks con `vi.fn()`, como `courses/`.

| Fichero | Casos |
|---|---|
| `deck.test.ts` | 11 — crear (valida, delega con el valor normalizado, acumula claves, id vacío, propaga el fallo del repo); actualizar; archivar/restaurar = `setArchived(true/false)`; listar excluye/incluye archivados; añadir/quitar concepto. |
| `concept.test.ts` | 7 — crear (delega sin `canonical_key`, acumula claves, id vacío); actualizar; archivar; listar excluye archivados; `get` propaga `null`. |
| `practice-item.test.ts` | 11 — `parsePracticeItemConfig` (siete modos válidos; cloze sin `answers`, modo desconocido y no-objeto → `undefined`); crear (cloze con limpieza de soluciones por el dominio; modo básico; `config` que no cuadra → `modeMismatch`; modo no V1 → `notAvailableInV1`; id vacío); actualizar; archivar; listar por concepto. |
| `tag.test.ts` | 7 — crear (valida y delega el `TagDraft` normalizado; segmento vacío; propaga `LibraryError('duplicate')`; id vacío); renombrar; borrar de verdad; etiquetar/desetiquetar/listar. |

**Adaptadores:** son finos y tipados; su mapeo fila↔dominio se ejercita cuando
LEX-3.5 monte pantallas, igual que los adaptadores de `courses`. Aun así, las
dos lecturas con recurso embebido se comprobaron contra el stack local (§4).

### Verificación por rotura

- **Regla de capas (nuevas carpetas `application/` e `infrastructure/` en
  `library`).** `import { createClient } from "@supabase/supabase-js"` en
  `application/deck.ts` → `pnpm lint` falla («La aplicacion depende de puertos,
  no de implementaciones concretas»). `import` de
  `infrastructure/supabase-deck-repository` en `application/deck.ts` → `pnpm
  lint` falla («Las dependencias apuntan hacia dentro»). Ambos revertidos. Los
  globs de `eslint.config.mjs` (`src/**/application/**`,
  `src/**/infrastructure/**`) cubren el módulo nuevo sin tocar la configuración.
- **PostgREST — filtro sobre recurso embebido.** Sonda contra el stack local
  (`node`, `SERVICE_ROLE`, `db:reset` de base): un mazo con un concepto vivo y
  otro archivado; `deck_concepts?select=position,concepts!inner(*)` +
  `.is("concepts.archived_at", null)` → devuelve **solo** el concepto vivo, y
  `row.concepts` es un **objeto** (no un array). Confirma que
  `supabase-deck-repository.listConcepts` y
  `supabase-tag-repository.{listForConcept,listConcepts}` filtran y mapean como
  se escribió. Sonda borrada.

## 4. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 23 ficheros/166, build)
pnpm db:test   10 ficheros / 240 asserciones, PASS (sin cambios: LEX-3.4 no toca SQL)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       sin cambios respecto a LEX-3.3 (LEX-3.4 no toca pantallas ni rutas)
```

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/library/application/library-error.ts` | Nuevo. `LibraryError` + `kind` + `libraryErrorFrom`. |
| `src/modules/library/application/{deck,concept,practice-item,tag}.ts` (+ `.test.ts`) | Nuevos. Puerto + casos de uso por entidad. |
| `src/modules/library/infrastructure/supabase-{deck,concept,practice-item,tag}-repository.ts` | Nuevos. Adaptadores Supabase + mapeadores fila↔dominio. |
| `src/composition/library.ts` | Nuevo. `getLibraryContextForCurrentUser()`. |
| `src/modules/README.md` | Fila `library` → «existe (`domain/`, `application/`, `infrastructure/`)». |
| `docs/evidence/LEX-3.4.md` | Este informe. |

Migraciones: **0**. `docs/DATA_MODEL.md` sin cambios (el esquema no se toca).

## 6. Riesgos y deuda

- **Los adaptadores no tienen test unitario propio** (patrón de la casa: los de
  `courses` tampoco). El mapeo fila↔dominio se cubre en LEX-3.5 al montar
  pantallas; las dos lecturas embebidas se sondearon a mano aquí.
- **`23503` no distingue «padre inexistente» de «padre ajeno»** — la FK
  compuesta lleva `owner_id`, así que desde el cliente son el mismo error. Se
  unifican en `parent-missing`. Suficiente para el mensaje de LEX-3.5.
- **`getLibraryContextForCurrentUser` crea los cuatro adaptadores siempre**,
  aunque una Server Action use uno. El coste es una `new` de un objeto con
  closures; ninguna consulta se dispara hasta que se llama a un método.
- Deuda arrastrada: revisión cruzada independiente §3.6 (aquí, la capa de
  aplicación de biblioteca). Sin segundo agente.

## 7. Estado del árbol Git

Rama `feat/lex-3-4-library-repositories` desde `main` (`2051d8c`), un commit
(`a9d96f1`). PR #29 fusionada a `main` (merge `c7b0871`); CI verde en los tres
trabajos, runs `33871218115` (PR) y `33871501880` (merge). Rama borrada.

## 8. Siguiente tarea

**LEX-3.5** — CRUD y archivado de mazos: pantallas ES/EN sobre
`getLibraryContextForCurrentUser()` + los casos de uso de `deck.ts` (crear,
renombrar/editar, categorizar, ordenar, archivar/restaurar; recuentos y estados
vacíos). Depende de LEX-3.4. No se inicia aquí.
