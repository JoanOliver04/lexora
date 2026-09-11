# LEX-5.12 — Reloj, UTC y zona horaria

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-12-clock-timezone`
**Estado resultante:** `EN PROCESO` (CI y fusión pendientes).

---

## 1. Alcance

`Clock` inyectado. Servidor autoritativo. Día local por IANA.
Medianoche, DST y `Europe/Madrid` cubiertos. **Sin UI.**

**Entregado:**

- Puerto `Clock` + `createFixedClock` + `createSystemClock`.
- `studyDayWindow` / `isIanaTimeZone`.
- `getDailyQueue` calcula la ventana; ya no recibe `dayStart`/`dayEnd`.
- `StudyContext.clock` y `timeZone`.
- Lint: `new Date()` vacío prohibido en dominio, aplicación y
  composición.

**Fuera de alcance:** UI de «Hoy»; estadísticas (FASE 7); snapshots
(LEX-5.13).

## 2. Decisiones

- Sin dependencia nueva: `Intl.DateTimeFormat` con `timeZone`.
- Zona por defecto `Europe/Madrid`, la del perfil.
- El día es `[medianoche local, medianoche siguiente)` en UTC.
- Primavera 2026-03-29: 23 h. Otoño 2026-10-25: 25 h.
- Casos de uso siguen recibiendo `now: Date`; la composición llama a
  `clock.now()`. La cola es quien necesitaba la ventana IANA.
- `new Date(iso)` en adaptadores (parseo) sigue siendo legal.

## 3. Tests

Dominio: IANA válida/inválida; invierno/verano Madrid; cruce de
medianoche; DST 23 h / 25 h; UTC.

Cola: cuenta actividad con la ventana de Madrid; zona inventada →
`invalid-timezone`.

Reloj fijo: mismo instante, objetos distintos.

## 4. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 56/357 + 1 skipped, build)
```

Sin migración. Sin e2e: no hay pantalla.

## 5. Archivos

- `src/shared/application/clock.ts` (+ test)
- `src/shared/infrastructure/system-clock.ts`
- `src/modules/study/domain/study-day.ts` (+ test)
- `src/modules/study/application/daily-queue.ts` (+ test)
- `src/modules/study/infrastructure/supabase-daily-queue-repository.ts`
- `src/composition/study.ts`
- `eslint.config.mjs`
- `docs/FSRS.md`, `docs/DATA_MODEL.md`, evidencia

Migraciones: **0**.

## 6. Siguiente

**LEX-5.13** — Versionar snapshots y preparar migraciones del scheduler.
No empezada.
