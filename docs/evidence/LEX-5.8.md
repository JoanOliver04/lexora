# LEX-5.8 — Caso de uso `ReviewPracticeItem`

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-8-review-practice-item`
**Estado resultante:** `HECHO`. PR #83 fusionada a `main` (merge `2cabb38`);
CI verde en los tres trabajos, runs `34608800875` (PR) y `34609364061`
(merge).

---

## 1. Alcance

Calcular la transición de un repaso. **No persiste.** El commit atómico
es LEX-5.9. **Sin UI.**

**Entregado:**

- `reviewPracticeItem`: identidad, ítem propio no archivado, estado
  existente, `revision` esperada, reloj inyectado, adaptador.
- 5 tests.

**Fuera de alcance:** escritura (LEX-5.9); idempotencia de red
(LEX-5.10); UI.

## 2. Decisiones

- El cliente envía `practiceItemId`, `rating`, `expectedRevision`.
  Nunca `dueAt` / `stability` / `difficulty`.
- `rating` que no es again/hard/good/easy (`manual` incluido) →
  `invalid-rating`.
- Sin estado → `no-state` (hace falta `ensureLearningState` antes).
- `revision` distinta → `revision-conflict`; no llama al adaptador.
- Ítem archivado → `archived`. No se valora.

## 3. Tests

Id vacío; `manual` no llama al adaptador; New+Good produce Learning
sin escribir; not-found / archived / no-state; conflicto de revisión.

## 4. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 53/337 + 1 skipped, build)
```

Sin migración. Sin e2e.

CI verde, tres trabajos: run `34608800875` (PR #83) y run `34609364061`
(merge).

## 5. Archivos

- `src/modules/study/application/review-practice-item.ts` (+ test)
- `docs/FSRS.md`, evidencia

Migraciones: **0**.

## 6. Siguiente

**LEX-5.9** — Commit atómico de repaso. Feature fusionada (PR #84); docs-close pendiente.
