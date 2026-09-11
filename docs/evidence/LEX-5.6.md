# LEX-5.6 — Ciclo de alta/activación de `LearningState`

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-6-learning-state-cycle`
**Estado resultante:** `EN PROCESO` (CI y fusión pendientes).

---

## 1. Alcance

Crear el estado `New` de forma idempotente al activar o estudiar un
ítem. **Sin UI. Sin migración.**

**Entregado:**

- Puerto `LearningStateRepository` y caso de uso `ensureLearningState`.
- Adaptador Supabase. Composición `getStudyContextForCurrentUser()`.
- 8 tests de caso de uso (reloj inyectado).

**Fuera de alcance:** cola diaria (LEX-5.7); `ReviewPracticeItem`
(LEX-5.8); reset explícito del calendario; UI.

## 2. Decisiones

- **Cuándo se crea:** al estudiar/activar, no al crear el ítem en la
  biblioteca. Un ítem que nunca se estudia no ocupa fila.
- **Idempotente:** si ya hay fila, se devuelve y no se llama al
  planificador. Una carrera `23505` relee la ganadora.
- **Archivar no borra memoria** (esquema LEX-5.4 + este caso de uso:
  un `ensure` con estado existente lo devuelve aunque el ítem esté
  archivado).
- **No se crea un `New` sobre un ítem archivado sin estado:** no hay
  nada que estudiar hasta restaurarlo.
- **Reactivar conserva.** Reiniciar es una acción explícita futura,
  no este caso de uso.
- **Q-006:** no se introduce cascada. El planificador de cola
  (LEX-5.7) filtrará conceptos archivados.
- Reloj como `now: Date`. Config v1 anotada en
  `scheduler_version` / `config_version`.

## 3. Tests

`learning-state.test.ts` (8): id vacío; primer `ensure` crea New;
segundo no llama al planificador; reactivar conserva `learning` y
`revision`; archivado con memoria la conserva; archivado sin memoria
→ `archived`; ítem ausente → `not-found`; carrera `duplicate` relee.

## 4. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 50/320 + 1 skipped, build)
```

Sin migración. Sin e2e: no hay pantalla. CI se registra al cerrar.

## 5. Archivos

- `src/modules/study/application/learning-state.ts` (nuevo)
- `src/modules/study/application/learning-state.test.ts` (nuevo)
- `src/modules/study/application/study-error.ts` (nuevo)
- `src/modules/study/infrastructure/supabase-learning-state-repository.ts` (nuevo)
- `src/composition/study.ts`
- `docs/DATA_MODEL.md`, `docs/FSRS.md`, evidencia

Migraciones: **0**.

## 6. Siguiente

**LEX-5.7** — Contrato y consulta de cola diaria. No empezada.
