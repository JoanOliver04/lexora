# LEX-3.9 — Biblioteca con búsqueda, filtros y paginación

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-9-search-filters-pagination`
**Estado resultante:** `EN PROCESO` → `HECHO` al fusionar con CI verde.

---

## 1. Alcance

Ámbito acotado tras consulta previa: de los tres componentes que enunciaba el
roadmap (buscar, filtrar, paginar sin N+1), **solo paginación y los dos
recuentos agregados tenían un motivador real** (deuda de N+1 ya anotada, con
sitio exacto, en la evidencia de LEX-3.5/3.6). La búsqueda por texto se
implementa igualmente —era barata una vez resuelta la paginación— pero con
`ilike`, no `pg_trgm`: LEX-3.3 dejó esa elección diferida explícitamente, y
sin datos de volumen reales, `pg_trgm` sería una migración justificada por una
suposición, no por una medición. Documentado como diferimiento, no como hueco,
en `docs/DATA_MODEL.md`.

**Entregado:**

- `DeckRepository.search` / `ConceptRepository.search`: texto (`ilike` sobre
  título), categoría/tipo, nivel MCER, `includeArchived`, `limit`/`offset`
  paginados con recuento total (`{ items, total }`).
- `DeckRepository.countConceptsByDeck`: recuento de conceptos vivos por mazo
  en una sola consulta para los mazos de la página visible — resuelve el N+1
  de `decks/page.tsx` (un `listDeckConcepts` por mazo).
- `TagRepository.listForConcepts`: etiquetas de varios conceptos en una sola
  consulta — resuelve el N+1 de `concepts/page.tsx` (un `listConceptTags` por
  concepto).
- `decks/page.tsx` y `concepts/page.tsx` reescritas: `<form method="get">` sin
  JavaScript para buscar/filtrar, paginación por enlaces «Anterior»/
  «Siguiente» con `Página X de Y`, mensaje «sin resultados» distinto de
  «biblioteca vacía».
- Reordenar mazos («Subir»/«Bajar») se **oculta** cuando hay búsqueda, filtro
  o más de una página activos: los índices de una página parcial ya no son
  vecinos reales en el orden global del curso.

**Fuera de alcance, declarado:**

- **`pg_trgm`** — diferido a que un volumen real lo justifique (§ arriba y
  `docs/DATA_MODEL.md`).
- **Búsqueda por prompt/respuesta de ítem y por nombre de etiqueta** (el
  roadmap las mencionaba) — los ítems de práctica se listan ya acotados por
  concepto (pocos por concepto, sin problema de volumen) y las etiquetas no
  tienen pantalla de lista propia; añadir búsqueda ahí sería alcance inventado
  sin una pantalla que lo consuma. Si una futura tarea añade una pantalla de
  etiquetas o de ítems a nivel de curso, esa tarea decide su propia búsqueda.
- **La lista de "conceptos disponibles para enlazar"** en el detalle de un
  mazo sigue siendo una consulta completa del curso (`listConcepts`, sin
  paginar): no es N+1 (una sola consulta), solo una lista que puede crecer;
  aceptable a los volúmenes de la V1, revisable si un volumen real lo pide.

## 2. Diseño

**Sin migración.** Los tres motivadores de una migración —`pg_trgm`, una
vista o función agregada para los recuentos, un índice nuevo para ordenar la
paginación— se evaluaron y ninguno se sostiene a los volúmenes de la V1 (§
`docs/DATA_MODEL.md`, «Búsqueda, filtros y paginación (LEX-3.9)»). Los
recuentos agregados se resuelven con una consulta que embebe la tabla
relacionada (`concepts!inner(archived_at)`, `tags!inner(*)`) y agrupa en
memoria en el adaptador — mismo patrón ya usado por `listConcepts`/
`listForConcept` desde LEX-3.4, solo con `deckIds`/`conceptIds` plural en vez
de uno.

`search` es un método **nuevo** en cada puerto, no una sobrecarga de `list`:
`list` sigue existiendo sin cambios porque `moveDeckAction` necesita el orden
completo y sin paginar para calcular un reordenamiento, y sobrecargar `list`
con parámetros opcionales habría hecho ambigua esa llamada.

`clampLimit`/`clampOffset` viven en un fichero nuevo,
`application/pagination.ts`, compartido por `deck.ts` y `concept.ts`: sin
dependencia de framework, mismo espíritu que `assertUserId` en cada fichero de
casos de uso — la URL nunca es de fiar del todo, aunque ya haya pasado por una
Server Action que la lee.

## 3. Tests

**Unitarios** (`pnpm test`, vitest): `deck.test.ts` (+6: `searchDecks`
valores por defecto/filtros y acotado de límites/usuario vacío;
`countConceptsPerDeck` delega/lista vacía no consulta/usuario vacío),
`concept.test.ts` (+3: `searchConcepts` equivalentes), `tag.test.ts` (+3:
`listTagsForConcepts` equivalentes). 191/191 en verde (27 ficheros).

**E2E** (`pnpm e2e`, Playwright): `decks.spec.ts` +2 casos —

- *Buscar y filtrar*: dos mazos de categorías distintas; buscar por texto deja
  solo el que coincide; «Quitar filtros» los devuelve a los dos; filtrar por
  categoría deja solo el de esa categoría; una búsqueda sin coincidencias
  muestra «Ningún mazo coincide con la búsqueda.», no el mensaje de biblioteca
  vacía.
- *Paginación*: 21 mazos (uno más que `PAGE_SIZE = 20`); el 20.º sigue en la
  página 1, el 21.º solo aparece tras «Siguiente» (página 2 de 2); «Subir»/
  «Bajar» no se renderizan con más de una página; «Anterior» vuelve a la
  página 1 sin arrastrar `?page=1` en la URL.

`concepts.spec.ts` +1 caso equivalente (buscar/filtrar por tipo; sin caso de
paginación repetido — la lógica es la misma pieza compartida
(`pagination.ts`), ya cubierta por decks). 72/72 e2e en verde (20 ficheros).

**pgTAP**: sin cambios (sin migración). `pnpm db:test`: 11 ficheros / 266
aserciones, PASS.

## 4. Verificación por rotura

La verificación por rotura de esta tarea ocurrió durante la propia autoría del
e2e de paginación, no como paso aparte:

- Primer intento del enlace «Anterior» generaba `?page=1` en vez de volver a
  `/decks` limpio (el enlace añadía siempre `page`, incluso cuando el destino
  era la página 1). El test lo detectó de inmediato
  (`expect(page).toHaveURL("/es/decks")` fallando con `?page=1` recibido) —
  corregido para omitir `page` del todo cuando el destino es la página 1.
- El bucle de creación de 21 mazos asumía que cada uno, recién creado, era
  visible en la lista — cierto para los 20 primeros, falso para el 21.º (cae
  en la página 2 por construcción). Corregido para no exigir esa visibilidad
  en el último.

Ambos son errores de la propia prueba, no de la aplicación — documentado aquí
por la misma razón que en LEX-3.7 (lección de autoría, no defecto de
producto).

## 5. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 27/191, build)
pnpm db:reset  6 migraciones + seed desde vacío (sin migración nueva en esta tarea)
pnpm db:test   11 ficheros / 266 aserciones, PASS (sin cambios)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       72 passed (20 ficheros; +3 casos de esta tarea)
```

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/library/application/pagination.ts` | Nuevo. `clampLimit`/`clampOffset`/`PageResult`. |
| `src/modules/library/application/deck.ts` | +`DeckRepository.search`/`countConceptsByDeck`; +`searchDecks`/`countConceptsPerDeck`. |
| `src/modules/library/application/concept.ts` | +`ConceptRepository.search`; +`searchConcepts`. |
| `src/modules/library/application/tag.ts` | +`TagRepository.listForConcepts`; +`listTagsForConcepts`. |
| `src/modules/library/application/{deck,concept,tag}.test.ts` | +12 tests; fakes actualizados con los métodos nuevos. |
| `src/modules/library/infrastructure/supabase-deck-repository.ts` | +`search`, +`countConceptsByDeck`. |
| `src/modules/library/infrastructure/supabase-concept-repository.ts` | +`search`. |
| `src/modules/library/infrastructure/supabase-tag-repository.ts` | +`listForConcepts`. |
| `src/app/[locale]/(app)/decks/page.tsx` | Reescrita: búsqueda/filtro/paginación, recuento agregado, reordenar oculto si filtrado/paginado. |
| `src/app/[locale]/(app)/concepts/page.tsx` | Reescrita: búsqueda/filtro/paginación, etiquetas agregadas. |
| `messages/{es,en}.json` | `Library`/`Concepts`: +`search`, +`filters`, +`pagination`, +`noResults`. |
| `tests/e2e/decks.spec.ts` | +2 casos (buscar/filtrar; paginación). |
| `tests/e2e/concepts.spec.ts` | +1 caso (buscar/filtrar). |
| `docs/DATA_MODEL.md` | +sección «Búsqueda, filtros y paginación (LEX-3.9)». |
| `docs/evidence/LEX-3.9.md` | Este informe. |

Migraciones: **0**.

## 7. Riesgos y deuda

- **`pg_trgm` diferido, no descartado.** Si el volumen real de un curso crece
  más allá de lo que un `seq scan` con `ilike` tolera sin percibirse, es una
  migración correctiva con su propia medición — no algo que deba adivinarse
  hoy.
- **Búsqueda por prompt/respuesta de ítem y por etiqueta, sin pantalla que lo
  pida todavía** (§1). Si una tarea futura añade esas pantallas, decide su
  propia búsqueda; no es una laguna de esta tarea, es alcance que no existía.
- **La lista de «conceptos disponibles para enlazar» en el detalle de un mazo
  sigue sin paginar** (§1) — una sola consulta, no N+1, pero puede crecer.
  Aceptable a los volúmenes de la V1.
- **`reorder` sigue sin ser atómico** (deuda arrastrada de LEX-3.5, no tocada
  aquí).
- Deuda arrastrada: revisión cruzada independiente §3.6. Sin segundo agente.

## 8. Estado del árbol Git

Rama `feat/lex-3-9-search-filters-pagination` desde `main` (`5576ba0`).
Pendiente: commit, PR contra `main`, CI verde en los tres trabajos, merge, CI
verde en `main`, cierre docs.

## 9. Siguiente tarea

**LEX-3.10** — Sugerencia de duplicados por `canonical_key`. Depende de
LEX-3.4 (`HECHO`). No se inicia aquí.
