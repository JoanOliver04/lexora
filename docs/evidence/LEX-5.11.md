# LEX-5.11 — Concurrencia optimista entre dispositivos

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-11-optimistic-concurrency`
**Estado resultante:** `EN PROCESO` (CI y fusión pendientes).

---

## 1. Alcance

Dos valoraciones con la misma `revision`: una confirma, la otra recibe
conflicto con el estado actual para recargar. Sin lost update. **Sin UI.**

**Entregado:**

- `reviewPracticeItem` y `confirmReview` devuelven `current` en
  `revision-conflict`.
- pgTAP `160-commit-review-concurrency.sql` (8 aserciones).
- Test de caso de uso: dos dispositivos, el segundo recibe revision 2.

**Fuera de alcance:** UI de recarga (FASE 6); reloj (LEX-5.12).

## 2. Decisiones

- **Sin migración.** `commit_review` ya bloquea con `FOR UPDATE` y
  rechaza `revision` distinta (LEX-5.9/5.10). Esta tarea prueba ese
  contrato y hace que la respuesta sirva para recargar.
- Claves de idempotencia **distintas** (si fueran la misma, LEX-5.10
  reexpediría).
- Dos backends no pueden ver los fixtures sin commitear; el solapamiento
  real lo serializa `FOR UPDATE` y el que espera ve la revision nueva.
  pgTAP cubre el resultado; el caso de uso cubre el TOCTOU (ambos
  calcularon contra revision 1, el segundo commit choca).

## 3. Tests

`160` (8): la función sigue teniendo `FOR UPDATE`; primer dispositivo
confirma; segundo con revision 1 y otra clave → `revision-conflict`;
revision 2; `due_at` y fase del ganador; un solo log `good`.

Caso de uso: conflicto de cálculo incluye `current`; conflicto del
committer relee el ganador; dos dispositivos, el segundo recibe
revision 2.

## 4. Puertas

```text
pnpm db:test   17 ficheros / 477 aserciones, PASS (160 nuevo: 8)
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 54/346 + 1 skipped, build)
```

Sin migración. Sin e2e: no hay pantalla.

## 5. Archivos

- `supabase/tests/database/160-commit-review-concurrency.sql`
- `src/modules/study/application/review-practice-item.ts` (+ test)
- `src/modules/study/application/confirm-review.ts` (+ test)
- `docs/FSRS.md`, `docs/DATA_MODEL.md`, evidencia

Migraciones: **0**.

## 6. Siguiente

**LEX-5.12** — Reloj, UTC y zona horaria. No empezada.
