# LEX-5.4 — Migraciones de `learning_states`, `study_sessions` y `review_logs`

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-4-study-schema`
**Estado resultante:** `HECHO`. PR #75 fusionada a `main` (merge `10a391f`);
CI verde en los tres trabajos, runs `34600614752` (PR) y `34601083487`
(merge).

---

## 1. Alcance

Tres tablas de estudio, solo estructura. Mapeo campo a campo desde
`LearningState` (LEX-5.2) más columnas de persistencia. **Sin UI. Sin
políticas RLS** (deny-all → LEX-5.5).

**Entregado:**

- Migración `20260911120000_study_schema`.
- Enums `memory_phase`, `study_session_status`, `review_rating`.
- pgTAP `120-study-schema.sql` (83 aserciones).
- `docs/DATA_MODEL.md` actualizado. Tipos regenerados.

**Fuera de alcance:** políticas e índices de cola (LEX-5.5); alta/activación
de estado (LEX-5.6); commit atómico de repaso (LEX-5.9).

## 2. Decisiones

- **Pertenencia estructural** igual que la biblioteca: `owner_id`
  denormalizado + FK compuesta. Sin FK suelta a `profiles`.
- **`practice_items UNIQUE (id, owner_id)`** añadido aquí: LEX-3.2 no lo
  necesitaba; las FK de estudio sí.
- **`elapsed_days` omitido.** MASTER_SPEC §13.11 lo nombra; ts-fsrs 5.4.2
  lo marca deprecado, 6.0 lo elimina, el dominio no lo tiene. No se
  persiste una columna muerta. Documentado en la migración, `DATA_MODEL.md`
  y `hasnt_column` en pgTAP.
- **`learning_step` incluido.** §13.11 lo omitió; el dominio y
  `Card.learning_steps` lo tienen. Sin la columna no hay ida/vuelta de una
  carta en Learning.
- **`phase` no `state`**, **`owner_id` no `user_id`**, **`last_reviewed_at`
  no `last_review_at`:** vocabulario del dominio y del resto del esquema.
- **Unicidad `(owner_id, practice_item_id)`** y
  **`(owner_id, idempotency_key)`** aquí (estructurales). Índices de cola
  e historial: LEX-5.5.
- **`review_logs` sin `updated_at`.** Append-only en operación normal;
  borrar la cuenta sigue pudiendo borrar las filas. Borrar la sesión deja
  el log con `study_session_id` nulo (`set null` con lista de columnas).
- **Archivar un ítem no borra memoria.** No hay trigger. Q-006 sigue
  abierta; el esquema no introduce cascada de archivo.
- **`Rating.Manual` no está en `review_rating`.**

## 3. Tests

`120-study-schema.sql` (83): tablas y PK; `learning_step` presente /
`elapsed_days` y `review_logs.updated_at` ausentes; enums (sin `manual`);
RLS habilitado y **cero políticas**; triggers solo en estados y sesiones;
cuatro FK compuestas; unicidades; índices de respaldo; cada CHECK
rechazando su valor; filas válidas; duplicado de estado y de clave de
idempotencia (`23505`); la misma clave en otro dueño se acepta; cruce
entre usuarios (`23503`); archivar el ítem conserva estado y log; borrar
el ítem cascada; borrar la sesión `set null`; borrar el curso cascada
sesiones.

Primera pasada: `review_logs` sin `ENABLE ROW LEVEL SECURITY` (010 y la
aserción 16); `completed` con `ended_at` anterior a `now()` (el default
de `started_at`). Corregidos; segunda pasada verde.

## 4. Puertas

```text
pnpm db:reset  10 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test   13 ficheros / 395 aserciones, PASS (120 nuevo: 83)
pnpm db:types  regenerado en el mismo commit
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 49/312 + 1 skipped, build)
```

Sin `pnpm e2e`: no hay pantalla.

CI verde, tres trabajos: run `34600614752` (PR #75) y run `34601083487`
(merge).

## 5. Archivos

- `supabase/migrations/20260911120000_study_schema.sql` (nuevo)
- `supabase/tests/database/120-study-schema.sql` (nuevo)
- `src/shared/infrastructure/supabase/database.types.ts` (regenerado)
- `src/modules/study/domain/memory.ts` (comentario)
- `docs/DATA_MODEL.md`, `docs/FSRS.md`, evidencia, `docs/STATUS.md`

Migraciones: **1**.

## 6. Siguiente

**LEX-5.5** — Restricciones, índices y RLS del estudio. No empezada.
