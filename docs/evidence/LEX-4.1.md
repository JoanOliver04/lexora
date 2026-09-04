# LEX-4.1 — Caracterizar formatos reales y crear fixtures legales

**Fecha:** 2026-09-04
**Rama:** `feat/lex-4-1-import-format-fixtures`
**Estado resultante:** `EN PROCESO` → `HECHO` al fusionar con CI verde.

---

## 1. Alcance

Primera tarea de FASE 4. **Sin el dataset real de Anki**: `07_Recursos/
Anki_Mazos` no existe en este clon. Preguntado explícitamente al
propietario antes de tocar nada (no era una decisión que correspondiera
tomar en solitario — CLAUDE.md §1: si un recurso local necesario no existe,
no se inventa su contenido, se pide). **Decisión de Joan:** proceder con
fixtures sintéticas basadas en el formato público y documentado del
exportador de notas en texto plano de Anki, sin ver ningún fichero propio
suyo; la caracterización contra el dataset real queda para cuando esté
accesible.

**Entregado:**

- **`docs/IMPORT_FORMAT.md`** (nuevo, spec pública): encoding, separador,
  líneas directivas (`#separator:`/`#html:`/`#tags column:`/`#columns:`,
  y por qué `#notetype column:`/`#deck column:` se reconocen pero se
  ignoran — el mazo de destino se elige en el flujo, MASTER_SPEC §9.7 paso
  5, nunca se infiere del archivo), columnas (frente/reverso/etiquetas),
  etiquetas jerárquicas `::` (coincide con `normalizeTagName`/`tagSegments`
  del dominio, LEX-3.1, sin conversión), campos entrecomillados en CSV
  (RFC 4180). Nota explícita de origen y de que **no se declara completa**.
- **`tests/fixtures/import/`** (nuevo, 9 ficheros): fixtures sintéticas —
  tabulador simple, con directivas, coma, punto y coma, campos
  entrecomillados, tags jerárquicos, BOM UTF-8 (verificado a nivel de byte:
  `ef bb bf`), una línea `#` **después** de la primera fila de datos (caso
  adversario: debe leerse como dato literal, no como directiva), y un
  fichero de filas inválidas (frente vacío, reverso vacío, una sola
  columna, columnas de más).

**Fuera de alcance, declarado:**

- **Puerto ni parser** — `DelimitedFileParser` es LEX-4.2. Esta tarea es
  caracterización y fixtures, no implementación; ningún fichero de estas
  fixtures se ha leído todavía por código.
- **Validación y saneamiento real** (tamaño, HTML no ejecutable, CSV
  injection al exportar) — LEX-4.5, `SECURITY.md` §16.2–16.3.
- **Mapeo de columnas en pantalla y vista previa** — LEX-4.4.
- **El algoritmo exacto de detección de separador/cabecera** — LEX-4.2
  decide cómo, esta tarea solo caracteriza qué formatos debe reconocer.

## 2. Verificación de las fixtures

Sin parser todavía que las lea, la verificación es a nivel de fichero:

```text
cat -A basic-tab.txt                    → tabulaciones literales (^I), confirmado
head -c 6 bom-utf8.txt | od -An -tx1    → ef bb bf (BOM UTF-8), confirmado
cat -A errors.txt                       → 4 filas, cada una con su defecto exacto
```

## 3. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 27/194, build)
```

Sin migración, sin código de aplicación tocado: no aplican `db:reset`,
`db:test`, `db:types` ni `pnpm e2e` — ningún esquema ni pantalla cambia.

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `docs/IMPORT_FORMAT.md` | Nuevo. Caracterización pública del formato de importación. |
| `tests/fixtures/import/basic-tab.txt` | Nuevo. Caso base tabulación. |
| `tests/fixtures/import/directives.txt` | Nuevo. Cabecera con directivas `#`. |
| `tests/fixtures/import/comma.csv` | Nuevo. CSV con coma. |
| `tests/fixtures/import/semicolon.csv` | Nuevo. CSV con punto y coma. |
| `tests/fixtures/import/quoted-fields.csv` | Nuevo. Campos entrecomillados RFC 4180. |
| `tests/fixtures/import/hierarchical-tags.txt` | Nuevo. Tags `::` múltiples por campo. |
| `tests/fixtures/import/bom-utf8.txt` | Nuevo. BOM UTF-8 al inicio. |
| `tests/fixtures/import/comment-line-not-a-directive.txt` | Nuevo. `#` fuera de cabecera. |
| `tests/fixtures/import/errors.txt` | Nuevo. Filas inválidas. |
| `docs/evidence/LEX-4.1.md` | Este informe. |

Migraciones: **0**.

## 5. Riesgos y deuda

- **Caracterización no verificada contra el dataset real** — es la
  limitación central de esta tarea, ya declarada en `docs/IMPORT_FORMAT.md`
  como nota de origen, no oculta. Si el dataset real aparece más adelante y
  revela una directiva o convención no cubierta aquí, esta página y estas
  fixtures se actualizan entonces.
- **Sin caso de BOM + CSV combinado** ni de directivas + CSV combinado en
  las fixtures — combinaciones cruzadas que LEX-4.2 puede necesitar si su
  implementación las trata de forma especial; se añaden entonces si hace
  falta, no antes de que exista el parser que las necesite.
- Deuda arrastrada: revisión cruzada independiente §3.6 (ahora también
  aplicable a FASE 4). Sin segundo agente — mismo motivo ambiental que
  `docs/evidence/LEX-3.12.md` §4 documentó para el cierre de M3.

## 6. Estado del árbol Git

Rama `feat/lex-4-1-import-format-fixtures` desde `main` (`8814c38`).
Pendiente: commit, PR contra `main`, CI verde en los tres trabajos, merge,
CI verde en `main`, cierre docs.

## 7. Siguiente tarea

**LEX-4.2** — Implementar puerto y parser delimitado (`DelimitedFileParser`
aislado tras una interfaz, Papa Parse o equivalente encapsulado, errores
con fila/código). Depende de LEX-4.1 (esta tarea). No se inicia aquí.
