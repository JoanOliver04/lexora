# LEX-3.6 — CRUD de conceptos

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-6-concept-crud`
**Estado resultante:** `EN PROCESO` → `HECHO` al fusionar con CI verde.

---

## 1. Alcance

Segunda pantalla de la biblioteca: CRUD de conceptos del curso activo (título,
resumen, explicación, ejemplo, nivel, tipo, fuente), sus etiquetas (alta,
asociar/desasociar) y el vínculo concepto↔mazo. Sobre
`getLibraryContextForCurrentUser()` y los casos de uso de `concept.ts` /
`tag.ts` / `deck.ts` (LEX-3.4). **Sin migración.** `db:test` sin cambios (240);
`db:types` limpio.

**Fuera de alcance, declarado:**

- **Sugerencia de duplicados por `canonical_key`** — explícitamente LEX-3.10;
  un concepto con el mismo título normalizado que otro se puede crear sin
  aviso.
- **Ítems de práctica** (`practice_items`) — LEX-3.7.
- **Edición de `concepts.metadata`** — no es de la V1 (declarado ya en
  LEX-3.4).

## 2. Forma

### Ruta

`src/app/[locale]/(app)/concepts/`:

| Archivo | Qué es |
|---|---|
| `page.tsx` | Lista (Server Component). `listConcepts` + un `listConceptTags` por concepto (N+1 consciente, como los recuentos de `decks/page.tsx`). `?archived=1` incluye los archivados. |
| `[conceptId]/page.tsx` | Detalle/edición. **Usa `ConceptRepository.get`** (existe desde LEX-3.4, a diferencia de `DeckRepository`): sin el rodeo de leer la lista completa y filtrar que necesitó `decks/[deckId]/page.tsx`. |
| `actions.ts` | Server Actions delgadas: `createConceptAction` / `updateConceptAction` (`useActionState`), `setConceptArchivedAction`, `attachTagAction` (`useActionState`, unión de error propia), `detachTagAction`. |
| `create-concept-form.tsx`, `edit-concept-form.tsx` | Cliente. Mismo patrón que los de mazo (LEX-3.5). |
| `concept-fields.tsx` | Campos compartidos. **`kind` y `summary` son obligatorios** (a diferencia de la categoría/descripción de un mazo): el `<select>` de tipo no tiene opción vacía, siempre parte de `CONCEPT_KINDS[0]`. |
| `add-tag-form.tsx` | Cliente, `useActionState` propio (`TagFormState`, distinto de `ConceptFormState`): no comparte región de error con el formulario del concepto. |
| `message-key.ts` | `conceptIssueKey` y `tagIssueKey` — dos funciones, una unión cada una. |

La **puerta de onboarding** se repite por página, como en `decks/` (deuda ya
anotada en LEX-3.5/2.9).

### Decisión: dónde vive el vínculo concepto↔mazo

**En el detalle del *mazo*** (`decks/[deckId]/page.tsx`, extendido aquí), no en
el de concepto. `DeckRepository` no tiene una consulta inversa («mazos que
contienen este concepto»): el detalle de mazo ya lee `listDeckConcepts` de un
mazo concreto de forma barata, y el detalle de concepto tendría que leer todos
los mazos del curso y comprobar la pertenencia de cada uno para saber cuáles lo
contienen — un método nuevo del puerto solo para simetría, sin caso de uso que
lo pida. Registrado como la decisión que el ROADMAP dejaba abierta en el cierre
de LEX-3.5.

`decks/actions.ts` gana `linkConceptToDeckAction` / `unlinkConceptFromDeckAction`
(`addConceptToDeck` / `removeConceptFromDeck` de `DeckRepository`, en el puerto
desde LEX-3.4, sin pantalla hasta ahora). Cada una revalida **las dos** rutas
que cambian: `/{locale}/decks` (el recuento por fila de la lista) y
`/{locale}/decks/{deckId}` (la lista enlazada), como ya hacía `updateDeckAction`.
`Library.emptyDeckConcepts` se reescribe (ya no dice «podrás añadirlos cuando
existan conceptos», eso ya pasó).

### Etiquetar por nombre: buscar-o-crear con normalización de dominio

`attachTagAction` recibe un nombre de texto libre (`AddTagForm`) y:

1. Lista las etiquetas del curso (`listTags`) y busca una cuyo
   `normalizedName` coincida con `normalizeTagName(rawName)` (dominio,
   LEX-3.1) — **no** comparación literal.
2. Si existe, reutiliza su `id`; si no, `createTag` y usa el `id` nuevo.
3. `tagConcept` enlaza.

Sin el paso 1 con normalización de dominio, escribir un nombre que ya existe
con otra capitalización («Idioms» vs. «idioms») intentaría crear una fila
nueva que choca con el índice único `tags (course_id, normalized_name)`
(LEX-3.3) — un `LibraryError('duplicate')` sin capturar en esa rama, que
tumbaría la Server Action. Verificado por rotura (§4) y cubierto en el e2e.

### Errores

- **Dominio** (`ConceptIssue`, 8 miembros: `kind.invalid`, `title.empty/tooLong`,
  `summary.empty/tooLong`, `explanation.tooLong`, `example.tooLong`,
  `cefrLevel.invalid`) → `Concepts.errors.*` vía `conceptIssueKey`.
- **Dominio** (`TagIssue`) → `Concepts.tags.errors.*` vía `tagIssueKey`.
- **Adaptador** (`LibraryError`): `error: "generic"` + `console.error`, como en
  mazos. Para etiquetas **sí** puede llegar `duplicate` en teoría (una
  condición de carrera entre el paso 1 y el 2 de `attachTagAction`, dos
  pestañas escribiendo el mismo nombre a la vez); se colapsa igual a
  `"generic"` — no hay reintento automático. Deuda anotada (§7).
- **`sourceReference` no tiene `ConceptIssue` propio**: LEX-3.1 no lo valida en
  el dominio, solo el CHECK de la base (`≤ 500`, LEX-3.2). El campo lleva
  `maxLength={500}` como ayuda del cliente, no como garantía — un valor que lo
  supere caería en `unavailable` → mensaje genérico. Debt heredada de LEX-3.1,
  no se amplía el dominio aquí (fuera del alcance declarado de esta tarea).

### i18n

Namespace `Concepts` nuevo (paralelo a `Onboarding`/`Auth`, no anidado bajo
`Library`: mazos y conceptos tienen campos, tipos y errores propios que no
comparten). `App.conceptsLink` añade el enlace desde el shell junto a
`decksLink`. `Library` gana las claves del vínculo con mazo
(`linkConceptLabel`, `linkConceptButton`, `linkConceptEmpty`,
`unlinkConceptButton`) y reescribe `emptyDeckConcepts`.

## 3. Tests

`pnpm test` → **26 ficheros, 174 tests, PASS** (24 / 170 previos + 2 ficheros /
4 nuevos):

| Fichero | Casos nuevos |
|---|---|
| `tests/unit/messages/concept-error-keys.test.ts` | +2 — `conceptIssueKey` transforma la clave; cada `ConceptIssue` tiene mensaje en `es` y `en`. |
| `tests/unit/messages/tag-error-keys.test.ts` | +2 — `tagIssueKey` transforma la clave; cada `TagIssue` tiene mensaje en `es` y `en`. |

`parity.test.ts` (sin cambios) ya cubre `Concepts` al caminar el árbol entero.

**E2E** `tests/e2e/concepts.spec.ts` (nuevo), 4 casos × 2 dispositivos:

1. **crear, editar, etiquetar, archivar** — desde el shell (`Mis conceptos`),
   estado vacío, crear, editar desde el detalle con **comprobación de
   identidad** (se captura el `conceptId` de la URL antes de editar y se
   verifica que la URL tras el segundo acceso es la misma), etiquetar por
   nombre, quitar la etiqueta, archivar → sale de la lista por defecto.
2. **validación** — sin resumen (obligatorio) → no se crea, mensaje, campo
   `aria-invalid="true"`.
3. **capitalización de etiquetas** — dos conceptos, se etiqueta el primero con
   «Idioms» y el segundo con «idioms»: el segundo muestra el nombre original
   («Idioms»), prueba de que reutiliza la misma fila.
4. **vínculo concepto↔mazo** — crear un concepto y un mazo por separado,
   enlazar desde el detalle del mazo, comprobar el recuento en el detalle y en
   la lista de mazos, quitar el vínculo → el mazo vuelve a estar vacío.

Aislamiento A/B **no se repite**: lo cubre pgTAP `090` (LEX-3.3).

**Adaptadores** (`supabase-concept-repository`, `supabase-tag-repository`,
`addConcept`/`removeConcept` de `supabase-deck-repository`): sin test unitario
propio (patrón de la casa); se ejercitan de punta a punta en `concepts.spec.ts`.

## 4. Verificación por rotura

- **Regla de capas.** `import` de
  `@/modules/library/infrastructure/supabase-concept-repository` en
  `concepts/actions.ts` → `pnpm lint` falla (misma regla que en LEX-3.5).
  Revertido.
- **Normalización al etiquetar por nombre.** Cambiar
  `normalizeTagName(rawName)` por `rawName` a secas (comparación literal) en
  `attachTagAction` → falla **solo**
  `concepts.spec.ts › etiquetar con distinta capitalización reutiliza la misma
  etiqueta` (2/2 dispositivos), el resto de la suite sigue en verde.
  Restaurado.

## 5. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 26 ficheros/174, build)
pnpm db:test   10 ficheros / 240 asserciones, PASS (sin cambios: LEX-3.6 no toca SQL)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       60 passed (escritorio + Poco F5); concepts.spec ×8 nuevos
```

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/app/[locale]/(app)/concepts/{page,actions,create-concept-form,edit-concept-form,concept-fields,add-tag-form,message-key}.tsx?` | Nuevos. |
| `src/app/[locale]/(app)/concepts/[conceptId]/page.tsx` | Nuevo. |
| `src/app/[locale]/(app)/decks/actions.ts` | +`linkConceptToDeckAction` / `unlinkConceptFromDeckAction`. |
| `src/app/[locale]/(app)/decks/[deckId]/page.tsx` | Lista de conceptos vinculados + formulario de enlace/desenlace, sustituye el recuento a secas. |
| `src/app/[locale]/(app)/app/page.tsx` | Enlace `Mis conceptos`. |
| `messages/{es,en}.json` | Namespace `Concepts`; `App.conceptsLink`; `Library` con las claves del vínculo y `emptyDeckConcepts` reescrita. |
| `tests/unit/messages/{concept,tag}-error-keys.test.ts` | Nuevos. |
| `tests/e2e/concepts.spec.ts` | Nuevo. |
| `docs/evidence/LEX-3.6.md` | Este informe. |

Migraciones: **0**. `docs/DATA_MODEL.md` sin cambios (el esquema no se toca).

## 7. Riesgos y deuda

- **N+1 en tags de la lista de conceptos** (`listConceptTags` por concepto) y
  en el vínculo de mazos (`listConcepts` completo del curso para calcular
  «disponibles»). Con el volumen de la V1 es asumible; LEX-3.9 resuelve las
  consultas paginadas.
- **Condición de carrera en `attachTagAction`**: entre «buscar etiqueta
  existente» y «crear si no existe» hay dos escrituras separadas; dos pestañas
  etiquetando el mismo nombre nuevo a la vez pueden chocar con `23505` en el
  `createTag` de la segunda. Se colapsa a `error: "generic"`, sin reintento. Un
  `rpc` transaccional (`find_or_create_tag`) lo resolvería si el uso real lo
  pide.
- **`sourceReference` sin `ConceptIssue` propio** (heredado de LEX-3.1): el
  cliente ayuda con `maxLength`, pero el único guardián real es el CHECK de la
  base; un exceso cae en el mensaje genérico, no en un error de campo.
- **Puerta de onboarding por página**, ahora en seis rutas (`app`, `onboarding`,
  `decks`, `decks/[deckId]`, `concepts`, `concepts/[conceptId]`); centralizarla
  en el layout sigue pendiente.
- Deuda arrastrada: revisión cruzada independiente §3.6. Sin segundo agente.

## 8. Estado del árbol Git

Rama `feat/lex-3-6-concept-crud` desde `main` (`4f74b9d`). Pendiente: commit,
PR contra `main`, CI verde en los tres trabajos, merge, CI verde en `main`,
cierre docs.

## 9. Siguiente tarea

**LEX-3.7** — Ítems básicos y dirección inversa: `basic_recognition`,
`basic_recall` y `cloze` simple; la dirección inversa crea otro `PracticeItem`
del mismo concepto, nunca otro concepto silencioso. Depende de LEX-3.6. No se
inicia aquí.
