# LEX-4.2 — Implementar puerto y parser delimitado

**Fecha:** 2026-09-05
**Rama:** `feat/lex-4-2-delimited-parser`
**Estado resultante:** `HECHO`. PR #49 fusionada a `main` (merge `0849ef2`);
CI verde en los tres trabajos, runs `33982072136` (PR) y `33982267457`
(merge).

---

## 1. Alcance

`docs/IMPORT_FORMAT.md` (LEX-4.1) caracterizó **qué** reconocer; esta tarea
implementa **cómo** leerlo, aislado tras una interfaz (MASTER_SPEC §9.7:
«el parser debe estar aislado tras una interfaz para poder sustituirse»).

**Entregado — módulo `src/modules/importing/` nuevo:**

- **`domain/`** (lógica pura, sin librería de CSV):
  - `separator.ts` — `Separator` (`tab`/`comma`/`semicolon`),
    `parseSeparatorDirective` (solo los tres nombres documentados; otro →
    `null` → heurística), `detectSeparator` (tabulación gana; si no, coma
    vs punto y coma por frecuencia; empate → coma).
  - `directives.ts` — `splitLeadingDirectiveLines` (corta en la primera
    línea que no empieza por `#`; una `#` posterior queda en los datos),
    `parseDirectiveLines` (`separator`, `tags column`, `html`; `notetype
    column`/`deck column`/`columns` reconocidas sin efecto).
  - `row.ts` — `classifyRow(columns, rowNumber, tagsColumn)` → fila válida
    o problema con código (`too_few_columns`, `too_many_columns`,
    `front_empty`, `back_empty`) y número de línea 1-indexado. No lanza.
- **`application/delimited-file-parser.ts`** — puerto `DelimitedFileParser.
  parse(content): ParseFileResult`. Devuelve `separator`,
  `separatorFromDirective` (si vino de `#separator:` o de la heurística),
  `rows` e `issues` por separado.
- **`infrastructure/papaparse-delimited-file-parser.ts`** — adaptador sobre
  Papa Parse. Papa Parse hace **solo** la tokenización (respeta comillas
  RFC 4180 y separadores dentro de un campo); descartar el BOM, separar
  directivas, elegir separador, clasificar y numerar filas es del `domain/`.
  `papaparse` no se importa en ningún otro sitio.
- **`src/composition/importing.ts`** — `createDelimitedFileParser()`,
  cableado puro. Sin `*ParaElUsuarioActual`: parsear no necesita identidad.

**Nueva dependencia:** `papaparse@5.7.0` (+ `@types/papaparse@5.5.2` dev).
Justificada por MASTER_SPEC §9.7, que la nombra explícitamente como librería
madura candidata. Nada más añadido.

**Regla de capas exigible:** `papaparse` añadida al grupo
`no-restricted-imports` de `domain/` y `application/` en `eslint.config.mjs`,
junto a `@supabase/*` y `ts-fsrs` — mismo trato que ADR-003 da a `ts-fsrs`.
Regresión en `tests/unit/architecture/layer-rules.test.ts` (ejecuta ESLint
contra código que la viola y exige que falle).

**Fuera de alcance, declarado:**

- `import_jobs`/`import_job_errors` — LEX-4.3. El puerto solo parsea, no
  persiste.
- Preview y mapeo de columnas en pantalla — LEX-4.4.
- Validación real (tamaño, filas, HTML no ejecutable, CSV injection) —
  LEX-4.5, `SECURITY.md` §16.2–16.3.
- Clasificación de duplicados — LEX-3.10 + LEX-4.6.
- Detección de baja confianza / confirmación en pantalla — LEX-4.4. El
  puerto puede devolver `separatorFromDirective: false` sin fallar.

## 2. Tests

**Unitarios** (`pnpm test`, vitest), `src/modules/importing/`:

- `infrastructure/papaparse-delimited-file-parser.test.ts` (9): la suite de
  casos válidos/adversos sobre las **9 fixtures de LEX-4.1**. Cada fixture
  prueba lo que su nombre dice — `bom-utf8.txt` se lee sin el BOM en el
  primer campo; `comment-line-not-a-directive.txt` produce la fila con
  frente `#1 rule` literal; `directives.txt` numera la primera fila de
  datos como línea 5 (4 directivas antes); `quoted-fields.csv` no parte la
  columna por el separador dentro de comillas; `errors.txt` produce
  exactamente los 4 códigos esperados con su número de línea.
- `domain/separator.test.ts` (7), `domain/directives.test.ts` (9),
  `domain/row.test.ts` (7): unidades puras.

223/223 en verde (31 ficheros, +4 nuevos / +32 tests). `layer-rules.test.ts`
ampliado: `papaparse` bloqueada en `domain/` (3 errores) y `application/`
(2 errores).

Sin `pnpm e2e` (el parser no tiene pantalla todavía, LEX-4.4) ni `db:test`
(sin esquema).

## 3. Puertas

```text
pnpm check   exit 0 (format, lint, typecheck, contraste 18/18, vitest 31/223, build)
```

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/importing/domain/separator.ts` | Nuevo. |
| `src/modules/importing/domain/directives.ts` | Nuevo. |
| `src/modules/importing/domain/row.ts` | Nuevo. |
| `src/modules/importing/domain/{separator,directives,row}.test.ts` | Nuevos. |
| `src/modules/importing/application/delimited-file-parser.ts` | Nuevo. Puerto. |
| `src/modules/importing/infrastructure/papaparse-delimited-file-parser.ts` | Nuevo. Adaptador Papa Parse. |
| `src/modules/importing/infrastructure/papaparse-delimited-file-parser.test.ts` | Nuevo. Suite sobre las fixtures. |
| `src/composition/importing.ts` | Nuevo. `createDelimitedFileParser()`. |
| `eslint.config.mjs` | `papaparse` al grupo restringido de `domain/` y `application/`. |
| `tests/unit/architecture/layer-rules.test.ts` | Regresión de `papaparse` bloqueada. |
| `src/modules/README.md` | Fila `importing` → «existe». |
| `package.json` / `pnpm-lock.yaml` | `papaparse@5.7.0`, `@types/papaparse@5.5.2` (dev). |
| `docs/evidence/LEX-4.2.md` | Este informe. |

Migraciones: **0**.

## 5. Riesgos y deuda

- **`#tags column:` con interpretación mínima:** se soporta como «cuál de
  las 3 columnas son las etiquetas»; las otras dos, en orden, son frente y
  reverso. El esquema real de Anki (con `notetype column`/`deck column`
  interactuando) es más rico, pero sin dataset real que lo exija esta
  interpretación es suficiente y está documentada en `docs/IMPORT_FORMAT.md`.
- **`skipEmptyLines: false`** a propósito, para alinear el índice de fila
  con la línea del archivo. Una línea en blanco intermedia se reporta como
  `too_few_columns` en vez de ignorarse — coherente con «no esconder
  problemas», pero LEX-4.4 puede querer tratarla distinto al mostrar el
  preview.
- **Heurística de separador conservadora:** no distingue confianza alta de
  baja más allá de `separatorFromDirective`. LEX-4.4 decide cuánto
  confiar antes de pedir confirmación.
- Deuda arrastrada: revisión cruzada independiente §3.6 (FASE 4). Sin
  segundo agente — mismo motivo ambiental que `docs/evidence/LEX-3.12.md` §4.

## 6. Estado del árbol Git

Rama `feat/lex-4-2-delimited-parser` desde `main` (`f90f812`), fusionada.
`main` en `0849ef2`. Cierre de documentación en `docs/lex-4-2-close`.

## 7. Siguiente tarea

**LEX-4.3** — Crear `import_jobs` e `import_job_errors` (migración, estados
cerrados, hash/config/contadores, retención acotada, RLS e índices).
Depende de LEX-4.1. No se inicia aquí.
