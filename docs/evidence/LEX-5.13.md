# LEX-5.13 — Snapshots versionados y migraciones del scheduler

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-13-scheduler-snapshots`
**Estado resultante:** `EN PROCESO` (CI y fusión pendientes).

---

## 1. Alcance

Cada estado/log identifica scheduler y config. Fixtures históricos
reconstruibles. Un salto de versión no se aplica en silencio.
Append-only compatible con borrado de cuenta. **Sin UI.**

**Entregado:**

- `snapshotLearningState` / `learningStateFromSnapshot`.
- `schedulerCompatibility`: bloquea par distinto.
- Fixtures `V1_FROZEN_NEW_GOOD` / `V1_FROZEN_NEW_EASY`.
- `reviewPracticeItem` → `scheduler-mismatch`.

**Fuera de alcance:** ADR de un salto 5.x→6.x (no se hace); UI; LEX-5.14.

## 2. Decisiones

- Sin migración de esquema: `scheduler_version` y `config_version` ya
  están (LEX-5.4).
- Compatible = mismo paquete (`5.4.2`) y misma `configVersion` (`v1`).
  Cualquier otro par exige ADR + migración + regresión.
- No se llama a `migrateParameters()`.
- El log sigue pudiéndose borrar con la cuenta (DELETE de dueño,
  cascade al ítem). FASE 8 orquesta el borrado.

## 3. Tests

Ida y vuelta de snapshot; JSON inválido; compatibilidad v1 vs v2/6.0.0;
repaso bloqueado si el estado es v2; fixtures congelados reproducen
Good +10 min y Easy +8 d.

## 4. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 56/362 + 1 skipped, build)
```

Sin migración. Sin e2e: no hay pantalla.

## 5. Archivos

- `src/modules/study/domain/memory.ts` (+ test)
- `src/modules/study/domain/scheduler-config.ts` (+ test)
- `src/modules/study/domain/scheduler-fixtures.ts`
- `src/modules/study/application/review-practice-item.ts` (+ test)
- `src/modules/study/application/confirm-review.ts`
- `src/modules/study/infrastructure/ts-fsrs-scheduler.test.ts`
- `src/modules/study/infrastructure/supabase-review-committer.ts`
- `docs/FSRS.md`, `docs/DATA_MODEL.md`, evidencia

Migraciones: **0**.

## 6. Siguiente

**LEX-5.14** — Auditoría y cierre de M5. No empezada.
