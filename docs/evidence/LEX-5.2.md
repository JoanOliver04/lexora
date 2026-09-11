# LEX-5.2 — Tipos internos y adaptador `TsFsrsScheduler`

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-2-fsrs-adapter`
**Estado resultante:** gates locales en verde. PR pendiente de CI.

---

## 1. Alcance

Puerto y adaptador sobre `ts-fsrs@5.4.2`. Tipos propios. Ida/vuelta
explícita. Dominio sin `ts-fsrs`. Transiciones congeladas con reloj
fijo. **Sin UI. Sin migración. Sin config de producto versionada
(LEX-5.3).**

**Entregado:**

- **`study/domain`:** `ReviewRating`, `MemoryPhase`, `LearningState`,
  `SchedulerConfig`. Valoraciones en minúsculas (`again`…`easy`), no
  los enteros de la librería.
- **Puerto** `SpacedRepetitionScheduler` (`createInitialState` /
  `preview` / `review`). `now` se inyecta.
- **`createTsFsrsScheduler()`** mapea campo a campo. `elapsed_days` no
  se guarda (deprecado). Composición `createSpacedRepetitionScheduler()`.
- Transiciones congeladas: `New+Good` → Learning +10 min;
  `New+Easy` → Review +8 días; preview = review; ida/vuelta.

**Fuera de alcance:** UI; persistencia `learning_states` (LEX-5.4);
valores V1 de config (LEX-5.3); `Clock` central (LEX-5.12); Q-006.

## 2. Tests

**Dominio:** ratings/fases; validación de config (retención 0.70–0.97).

**Adaptador:** 5 casos, reloj `2026-09-11T10:00:00.000Z`, fuzz apagado.

## 3. Puertas

```text
pnpm check    exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 48 ficheros / 305 passed / 1 skipped, build)
```

Sin migración: `db:test` no aplica. Sin pantalla: sin e2e extra.

## 4. Archivos

Módulo `src/modules/study/` (`domain/`, `application/`,
`infrastructure/`), `src/composition/study.ts`, `docs/FSRS.md`,
README de módulos, evidencia.

Migraciones: **0**.

## 5. Decisiones

- **`LearningState` no es la fila SQL.** Sin `ownerId` ni `revision`.
- **Pasos como `1m`/`10m`**, no milisegundos: coinciden con la librería
  y con lo que LEX-5.3 versionará.
- **Pesos `w` aún no viajan** en `SchedulerConfig`: el adaptador deja
  que `generatorParameters` los rellene. LEX-5.3 los congela.
- **`createInitialState` no llama a `fsrs()`:** `createEmptyCard(now)`
  basta; la config se usa en `preview`/`review`.

## 6. Siguiente

**LEX-5.3** — Configuración FSRS v1 versionada. No empezada.
