# LEX-3.1 — Modelo de dominio de biblioteca

**Fecha:** 2026-09-02
**Rama:** `feat/lex-3-1-library-domain` (PR #22, merge `426b2b3`)
**Estado resultante:** `HECHO`

---

## 1. Alcance

Primer paso de FASE 3 / M3: el **dominio puro** del módulo `library` (mazos,
conceptos, ítems de práctica y etiquetas), antes de cualquier esquema o
pantalla.

**Fuera de alcance, declarado:**

- **Migraciones** (`decks`, `concepts`, …) → LEX-3.2.
- **Repositorios y casos de uso** → LEX-3.4.
- **CRUD y pantallas** (mazos LEX-3.5, conceptos LEX-3.6, ítems LEX-3.7,
  búsqueda LEX-3.9, previsualización LEX-3.11).
- **Sugerencia de duplicados**: la normalización `canonicalKey` /
  `normalizeTagName` vive aquí; comparar y mostrar candidatos es LEX-3.10.
- **Elección de dirección inversa en la interfaz** → LEX-3.7. Aquí está la
  primitiva `reverseOf`.

Sin migración, sin `db:types`, sin tocar SQL. `db:test` sigue en 123.

## 2. Módulo `library/domain/`

Cinco ficheros, uno por concepto cohesivo (el patrón de
`courses/domain/onboarding.ts`: un fichero por idea, no por tipo). Sin
`index.ts` —nada fuera de `domain/` importa aún de dos ficheros a la vez, y un
barril se saldría de la cobertura (`coverage.exclude: **/index.ts`)—.

### `taxonomy.ts` — vocabulario cerrado

- `CefrLevel` (`A1`–`B2`), `CEFR_LEVELS`. **No se importa de `courses/domain`**:
  la organización es *feature-first* (ADR-001) y acoplar `library` a `courses`
  por cuatro literales no compensa. Comentario que obliga a que coincida con
  `public.cefr_level`.
- `DeckCategory`, `ConceptKind`, `PracticeMode` (los **siete** reservados de
  §13.9), `V1_PRACTICE_MODES` (los tres activables), `isPracticeMode`,
  `isV1PracticeMode`.
- Helpers de texto: `normalizeWhitespace` (recorta y colapsa espacios internos,
  **sin tocar acentos ni mayúsculas**), `isBlank`, `readOptionalText`
  (ausente/vacío → `null`), límites `TITLE_MAX_LENGTH` (200),
  `SHORT_TEXT_MAX_LENGTH` (500), `LONG_TEXT_MAX_LENGTH` (4000). El esquema de
  LEX-3.2 debe usar estos límites o mayores; la base es el guardián último.
- `readOptionalEnum(value, allowed)` + la marca `INVALID_ENUM`: una sola
  implementación para leer nivel, categoría y cualquier enum opcional —ausente
  → `null`, dentro del vocabulario → el valor, fuera → `INVALID_ENUM`—, en vez
  de repetir la función y su símbolo centinela en cada entidad.

### `deck.ts`

`interface Deck` (persistido) + `interface DeckDraft` (editable) +
`validateDeckDraft(raw)` → `{ ok, value }` | `{ ok: false, issues }` con las
claves estables `deck.title.empty` / `.tooLong`, `deck.description.tooLong`,
`deck.cefrLevel.invalid`, `deck.category.invalid`. Nivel y categoría opcionales
(`null`); si vienen, deben ser del vocabulario cerrado. `isArchived(deck)`.

**`Q-005` (abierta):** §9.5 ofrece «profesional» tanto en la lista de **nivel**
como en la de **categoría**; §13.6 nombra la columna `cefr_level`, que solo
admite bandas MCER. LEX-3.1 se entrega con la recomendación —`professional` es
una **categoría**, `deck.cefrLevel: CefrLevel | null`— y registra
`docs/OPEN_QUESTIONS.md` Q-005 con opciones e impacto. No bloquea LEX-3.1; sí
condiciona el enum de `decks.cefr_level` en LEX-3.2, que no debe fijarlo sin la
decisión de Joan.

### `concept.ts`

`interface Concept` + `ConceptDraft` + `validateConceptDraft` (título y resumen
obligatorios; explicación / ejemplo / nivel / referencia opcionales). Claves
`concept.kind.invalid`, `concept.title.*`, `concept.summary.*`,
`concept.explanation.tooLong`, `concept.example.tooLong`,
`concept.cefrLevel.invalid`.

`canonicalKey(title)` — minúsculas + `normalizeWhitespace`. **No quita acentos**:
el idioma de apoyo es español y `canonical_key` chocaría en contenido real si se
plegara `é`→`e`. §13.7 prohíbe fusionar automáticamente; el normalizador se
mantiene conservador y LEX-3.10 decide cuánto se afloja la coincidencia.

### `practice-item.ts`

- `type PracticeItemConfig` — unión discriminada por `mode`. En la V1
  `basic_recognition` / `basic_recall` no llevan nada más; `cloze` guarda
  `answers: string[]` (soluciones de los huecos, en orden — §9.6 «cloze simple
  si el archivo ya contiene un hueco», que LEX-4.x producirá). Los cuatro modos
  futuros llevan solo el discriminante. §13.9 pide validarlo con Zod **en el
  borde** (LEX-3.4); el dominio describe la forma y la valida sin Zod.
- `validatePracticeItemDraft` — un modo reservado pero no activable en la V1 se
  rechaza con `practiceItem.mode.notAvailableInV1`, no se acepta en silencio.
  `config` solo se comprueba si el modo es conocido (para no apilar ruido sobre
  `mode.invalid`). `cloze` sin soluciones utilizables → `clozeAnswersEmpty`.
- `canReverse(mode)` / `reverseOf(draft)` — **la dirección inversa es otro
  borrador de ítem del mismo concepto, nunca otro concepto** (§8.5, §9.6).
  Intercambia enunciado ⇄ respuesta y `basic_recognition` ⇄ `basic_recall`; para
  los demás modos devuelve `null`. La pista no se arrastra (una pista de
  `palabra → significado` rara vez sirve al revés). Aplicar `reverseOf` dos
  veces devuelve el original salvo la pista (probado).

### `tag.ts`

`interface Tag` + `TagDraft` + `normalizeTagName` (minúsculas, recorte, colapso
de espacios y de los espacios alrededor de `::`) + `tagSegments` +
`validateTagDraft`. La jerarquía importada con `::` se **conserva** sin
convertirla en árbol (§13.10); un segmento vacío (`a::`, `::b`, `a::::b`) se
rechaza con `tag.name.emptySegment`. Duplicados equivalentes: la restricción por
`normalizedName` es de LEX-3.3.

## 3. Regla de capas — verificación por rotura

`eslint.config.mjs` aplica `no-restricted-imports` por glob
(`src/**/domain/**`), no por módulo, así que `library/domain` queda cubierto sin
tocar la configuración. Comprobado: añadido
`import { createClient } from "@supabase/supabase-js"` a
`taxonomy.ts` → `pnpm lint` falla con «El dominio no conoce Supabase ni ts-fsrs
(ADR-001 y ADR-003)». Revertido. `layer-rules.test.ts` ya prueba la regla con
rutas ficticias; no necesita cambio.

## 4. Tests

`pnpm test` → **19 ficheros, 129 tests, PASS** (14 / 85 previos + 5 ficheros /
44 tests nuevos):

| Fichero | Casos |
|---|---|
| `taxonomy.test.ts` | 7 — `normalizeWhitespace` conserva acentos; `readOptionalText`; `readOptionalEnum` (null / valor / `INVALID_ENUM`); los siete modos y el subconjunto V1. |
| `deck.test.ts` | 8 — borrador completo y normalización; nivel/categoría ausentes; cada categoría; título vacío / largo; nivel y categoría inválidos acumulados; entrada no-objeto; `isArchived`. |
| `concept.test.ts` | 9 — `canonicalKey` (acentos no colisionan); borrador válido; cada `kind`; título y resumen obligatorios acumulados; `kind` desconocido; explicación larga; nivel no MCER; `isArchived`. |
| `practice-item.test.ts` | 11 — reconocimiento; cloze con limpieza de soluciones; modo futuro rechazado; modo desconocido sin ruido de config; `config` que no cuadra con el modo; cloze vacío; enunciado y respuesta acumulados; `canReverse`; `reverseOf` intercambia y no arrastra pista; doble inversa; `null` para cloze. |
| `tag.test.ts` | 9 — normalización y jerarquía `::`; segmentos; nombre plano; jerarquía; vacío; segmento vacío (`a::`, `::b`, `a::::b`); demasiado largo. |

## 5. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 8/8, vitest 19 ficheros/129, build)
pnpm db:test   8 ficheros / 123 asserciones, PASS (sin cambios: LEX-3.1 no toca SQL)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       sin cambios respecto a LEX-2.11 (dominio puro, sin pantallas ni rutas)
```

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/library/domain/taxonomy.ts` (+ `.test.ts`) | Nuevo. Enums cerrados, modos V1, helpers de texto. |
| `src/modules/library/domain/deck.ts` (+ `.test.ts`) | Nuevo. `Deck`, `DeckDraft`, `validateDeckDraft`, `isArchived`. |
| `src/modules/library/domain/concept.ts` (+ `.test.ts`) | Nuevo. `Concept`, `ConceptDraft`, `validateConceptDraft`, `canonicalKey`, `isArchived`. |
| `src/modules/library/domain/practice-item.ts` (+ `.test.ts`) | Nuevo. `PracticeItem`, `PracticeItemConfig` (unión discriminada), `validatePracticeItemDraft`, `canReverse`, `reverseOf`, `isArchived`. |
| `src/modules/library/domain/tag.ts` (+ `.test.ts`) | Nuevo. `Tag`, `TagDraft`, `normalizeTagName`, `tagSegments`, `validateTagDraft`. |
| `src/modules/README.md` | La fila de `library` pasa a «existe solo `domain/`». |
| `docs/OPEN_QUESTIONS.md` | `Q-005` — «profesional»: nivel o categoría. |
| `docs/evidence/LEX-3.1.md` | Este informe. |

Migraciones: **0**. No se toca `docs/DATA_MODEL.md` (documenta el esquema real,
que no existe hasta LEX-3.2).

## 7. Riesgos y deuda

- **`Q-005` abierta** («profesional»: nivel o categoría, §2 `deck.ts`).
  Recomendación registrada (categoría). Si Joan decide lo contrario, `taxonomy.ts`
  y la migración de LEX-3.2 cambian.
- **Límites de longitud** (`TITLE_MAX_LENGTH`, …) elegidos aquí; LEX-3.2 debe
  fijar columnas ≥ estos valores, o el guardián de la base y el mensaje del
  dominio se contradicen.
- **`PracticeItemConfig` de `cloze`** modela `answers: string[]`. Si la
  importación de FASE 4 necesita más (posición del hueco, plantilla), se amplía
  la variante entonces; la unión discriminada lo permite sin romper las otras.
- Deuda arrastrada de M2: revisión cruzada independiente §3.6 (aquí, el modelo
  de dominio de biblioteca). Sin segundo agente.

## 8. Estado del árbol Git

Rama `feat/lex-3-1-library-domain` desde `main` (`82f9844`), dos commits
(`96b8986` dominio; `d2d2a43` consolidación de `readOptionalEnum` + Q-005 +
README). PR #22 fusionada a `main` (merge `426b2b3`); CI verde en los tres
trabajos, runs `33657579290` (PR — el job «Base de datos» falló primero por
`toomanyrequests` / `address already in use` del runner y se reintentó) y
`33658253752` (merge). Rama borrada.

## 9. Siguiente tarea

**LEX-3.2** — migraciones de `decks`, `concepts`, `deck_concepts`,
`practice_items`, `tags` y `concept_tags`: esquema normalizado, `mode` cerrado,
JSONB discriminado solo donde procede, FKs y archivado deliberado, diagrama
actualizado. Depende de LEX-3.1. No se inicia aquí.
