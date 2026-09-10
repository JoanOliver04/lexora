# LEX-4.7 — Implementar caso de uso de importación por lotes

**Fecha:** 2026-09-10
**Rama:** `feat/lex-4-7-batch-import`
**Estado resultante:** `HECHO`. PR #59 fusionada a `main` (merge `cd6e9de`);
CI verde en los tres trabajos, runs `34480035517` (PR) y `34480526200`
(merge).

---

## 1. Alcance

Confirmar y ejecutar. Cada fila válida nueva —o duplicada con `copy`—
crea un `Concept` (`vocabulary`, título = frente, resumen = reverso) y un
`PracticeItem` `basic_recognition`. Inversa opcional: segundo ítem del
mismo concepto. Etiquetas al concepto, reutilizando `normalizeTagName`.
`skip` no crea. Un fallo de fila no aborta el lote.

**Entregado:**

- **`executeImport`** (aplicación): mapea, clasifica, escribe
  `import_jobs` (`importing` → `completed`, o `failed` si aborta) y
  `import_job_errors`. Sin SQL en la Server Action.
- **Puerto `ImportJobRepository`** + adaptador Supabase.
- **Selector mínimo de mazo** (los que ya existen en el curso) y
  casilla de inversa. Si no hay mazo, no se confirma: hay que crearlo
  antes. El wizard completo es LEX-4.8.
- **Contadores:** `rows_duplicate` = clasificadas como duplicadas;
  `rows_skipped` = duplicadas con `skip` (las mismas filas; no hay otro
  motivo de omisión); `rows_created` = conceptos creados; `rows_failed`
  = inválidas o rechazadas al persistir. Un trabajo con fallos parciales
  termina `completed`.
- **`rejected`** en `import_error_code` para filas que pasan el parser
  pero no las reglas de biblioteca (título 200, reverso 500, error de
  persistencia). Migración `20260910160000_import_error_code_rejected`.
- **Idempotencia:** cada confirmación es un trabajo nuevo. `skip` evita
  duplicar la biblioteca; `copy` crea conceptos nuevos a propósito.

**Fuera de alcance:** wizard con pasos 5–6 pulidos (LEX-4.8); progreso
visual (LEX-4.9); dataset real (LEX-4.10).

## 2. Tests

**Unitarios:** `execute-import.test.ts` (6: crear, skip vs copy, fallo
parcial, título demasiado largo, sin mazo, inversa).
`content-hash.test.ts` (2). vitest 41/278.

**pgTAP** `110`: 45 → 46 (label `rejected` + cast).

**E2E:** sin mazo no hay botón de confirmar; con mazo, importar
`basic-tab.txt` crea 2 conceptos; reimportar con skip → 0 creadas, 2
omitidas.

## 3. Puertas

```text
pnpm check    exit 0 (format, lint, typecheck, contraste 18/18, vitest 41/278, build)
pnpm db:reset 9 migraciones + seed desde vacío
pnpm db:test  12 ficheros / 312 aserciones, PASS (110: 46)
pnpm db:types regenerado; diff = `rejected`
pnpm e2e      90 passed
```

## 4. Archivos

Nuevo: `execute-import.ts`, `import-job.ts`, adaptador, `content-hash.ts`,
migración `rejected`, evidencia.

Migraciones: **1** (`20260910160000_import_error_code_rejected`).

## 5. Decisiones

- **Sin mazo mágico.** Si el curso no tiene mazos, se pide crear uno.
- **`skip` → `rows_skipped` y `rows_duplicate`.** Son las mismas filas.
- **Cada confirmación = un trabajo.** No se reutiliza por `content_hash`.
- **`kind: vocabulary`** para lo importado en V1 (cartas frente/reverso).

## 6. Siguiente

**LEX-4.8** — Wizard completo de importación. No empezada.
