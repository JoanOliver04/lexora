# LEX-5.7 — Contrato y consulta de cola diaria

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-7-daily-queue`
**Estado resultante:** `EN PROCESO` (CI y fusión pendientes).

---

## 1. Alcance

Consulta de cola. Ordenación en el dominio. **Sin UI de sesión.**

**Entregado:**

- `assembleDailyQueue` (dominio) + `getDailyQueue` (caso de uso).
- Puerto `DailyQueueRepository` y adaptador Supabase.
- 12 tests (8 dominio + 4 caso de uso).

**Fuera de alcance:** pantalla «Hoy» (FASE 6); `Clock`/zona IANA
(LEX-5.12); `ensure` al armar la cola.

## 2. Decisiones

- **Tres bandas:** Learning/Relearning vencidos → Review vencidos →
  New. Desempate `practiceItemId`. New se ordena solo por id.
- **Nuevos por `PracticeItem`**, no por concepto. Cupo =
  `daily_new_limit −` ítems que hoy salieron de `new` en un log.
- **Límite de repasos** recorta solo Review. `null` = sin tope.
  Learning no consume ese cupo.
- **Q-006:** la cola filtra `concepts.archived_at`. Sin cascada.
- **Mazos:** `deckIds` nulo = todos los no archivados del curso;
  `[]` = ninguno. Un mazo archivado o de otro curso no entra.
- **Ítem sin estado** aparece como New con `learningStateId` nulo.
  La cola no llama a `ensureLearningState`.
- **Día:** `dayStart`/`dayEnd` inyectados. LEX-5.12 hará la ventana
  IANA.

## 3. Tests

Dominio: orden de bandas; desempate; cupo de nuevos; límite de
Review que no toca Learning; `nextDueAt`; cupo agotado. Caso de
uso: id vacío; curso inexistente; cupos de hoy; `[]` de mazos.

## 4. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 52/332 + 1 skipped, build)
```

Sin migración. Sin e2e: no hay pantalla. CI se registra al cerrar.

## 5. Archivos

- `src/modules/study/domain/queue.ts` (+ test)
- `src/modules/study/application/daily-queue.ts` (+ test)
- `src/modules/study/infrastructure/supabase-daily-queue-repository.ts`
- `src/composition/study.ts`, `docs/FSRS.md`, evidencia

Migraciones: **0**.

## 6. Siguiente

**LEX-5.8** — Caso de uso `ReviewPracticeItem`. No empezada.
