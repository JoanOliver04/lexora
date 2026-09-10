# LEX-4.9 — Mostrar progreso, resumen y errores recuperables

**Fecha:** 2026-09-10
**Rama:** `feat/lex-4-9-import-summary`
**Estado resultante:** `HECHO`. PR #63 fusionada a `main` (merge `d0bf459`);
CI verde en los tres trabajos, runs `34487576161` (PR) y `34488133971`
(merge).

---

## 1. Alcance

Tras ejecutar (LEX-4.7) el wizard (LEX-4.8) mostraba una frase de
recuentos. Esta tarea la convierte en un resumen que cuadra con el
trabajo persistido y hace revisables las filas fallidas.

**Entregado:**

- **`executeImport`** devuelve `errors` (código, mensaje seguro, muestra
  saneada) además de los contadores. Los totales salen del job
  `completed`, no de un recuento paralelo.
- **Resumen:** creadas / omitidas / duplicadas / fallidas / total, cada
  uno en su línea. `errors.length === rowsFailed`.
- **Lista** de filas que no se importaron (hasta 50 en pantalla) y
  **descarga** `.txt` con todas (número, mensaje, muestra). Sin el
  archivo original. `.txt` a propósito: un CSV dispararía fórmulas.
- **Reintento:** nota visible + «Importar otro archivo». Es un trabajo
  **nuevo**; no se reutiliza un job `completed`. `skip` sigue siendo la
  guarda de la biblioteca.
- **Progreso:** el lote es síncrono. El botón ya dice «Importando…»
  (`aria-busy`). Sin cola ni job asíncrono.

**Fuera de alcance:** dataset real (LEX-4.10); auditoría M4 (LEX-4.11);
historial de trabajos; cola.

## 2. Tests

**Unitarios:** `execute-import.test.ts` (errores viajan con el resultado
y cuadran con `job.rowsFailed`). `format-import-error-report.test.ts`
(2). vitest 43/282.

**E2E:** `errors.txt` → 1 creada · 3 fallidas · total 4; se listan las
filas 1 y 2; descarga `lexora-import-errors.txt`. Escritorio + Poco F5.

## 3. Puertas

```text
pnpm check    exit 0 (format, lint, typecheck, contraste 18/18, vitest 43/282, build)
pnpm e2e      94 passed (import-preview.spec.ts +1: errores + descarga)
```

Sin migración: `db:test` / `db:types` no aplican.

## 4. Archivos

Nuevo: `format-import-error-report.ts` + test, evidencia.

Migraciones: **0**.

## 5. Decisiones

- **Errores en el resultado del caso de uso**, no un `list` extra del
  repositorio: ya se escriben al persistir; devolverlos evita una
  segunda lectura y SQL en la acción.
- **Descarga en el cliente** (Blob). No hay endpoint nuevo ni el
  archivo original.
- **Progreso = botón pendiente.** Inventar una barra por fila exigiría
  streaming o un job asíncrono, fuera de LEX-4.7.

## 6. Siguiente

**LEX-4.10** — Probar archivos privados reales y rendimiento. No empezada.
