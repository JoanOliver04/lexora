# LEX-5.5 — Restricciones, índices y RLS del estudio

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-5-study-rls`
**Estado resultante:** `HECHO`. PR #77 fusionada a `main` (merge `81f5d0b`);
CI verde en los tres trabajos, runs `34602539398` (PR) y `34602997962`
(merge).

---

## 1. Alcance

Políticas RLS de dueño, índices de cola e historial, y aislamiento
dueño/no-dueño sobre las tres tablas de LEX-5.4. **Sin UI.**

**Entregado:**

- Migración `20260911150000_study_rls`.
- pgTAP `130-study-rls.sql` (45 aserciones).
- `120-study-schema.sql` deja de exigir cero políticas (eso era el
  hueco deliberado de LEX-5.4).

**Fuera de alcance:** alta/activación de `LearningState` (LEX-5.6);
consulta de cola (LEX-5.7); commit atómico (LEX-5.9).

## 2. Decisiones

- **Patrón LEX-3.3:** `(select auth.uid()) = owner_id` envuelto
  (InitPlan). `force row level security` no. Sin join: las FK
  compuestas de LEX-5.4 ya atan `owner_id` al padre.
- **`review_logs` sin `UPDATE`.** Ni el dueño. Un `UPDATE` propio
  afecta cero filas (no hay política `USING`), igual que un intento
  contra la fila de otro. `DELETE` sí: borrado de cuenta.
- **Índices:** `(owner_id)` en las tres (predicado RLS); cola
  `(owner_id, due_at)`; sesiones `(owner_id, started_at desc)`;
  historial `(owner_id, reviewed_at desc)` y
  `(owner_id, practice_item_id, reviewed_at desc)`. Las unicidades
  de negocio ya estaban en LEX-5.4.
- **`010-rls-enabled.sql` no se amplía** a «≥1 política»: el patrón
  de dos fases sigue siendo legal para tablas futuras.

## 3. Tests

`130-study-rls.sql` (45): juego exacto de políticas; ≥1 política;
índices; `auth.uid()` anclado; A ve solo lo suyo y no alcanza lo de
B ni por UUID; A actualiza estado y sesión propios y añade un log;
A no edita su propio log (cero filas); `INSERT` como B → `42501`;
colgar del ítem de B → `23503` (esquema); `UPDATE`/`DELETE` ajenos
→ cero filas; B intacto; anon nada; `service_role` salta RLS.

Hallazgo real: `UPDATE` sin política **no** lanza `42501` sobre la
fila propia; filtra todas las filas y no toca ninguna. El test se
reescribió al patrón de 090/110.

## 4. Puertas

```text
pnpm db:reset  11 migraciones + seed desde vacío
pnpm db:test   14 ficheros / 439 aserciones, PASS
               (120: 83→82; 130 nuevo: 45)
pnpm db:types  sin cambios (RLS e índices no alteran los tipos)
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 49/312 + 1 skipped, build)
```

Sin e2e: no hay pantalla.

CI verde, tres trabajos: run `34602539398` (PR #77) y run `34602997962`
(merge).

## 5. Archivos

- `supabase/migrations/20260911150000_study_rls.sql` (nuevo)
- `supabase/tests/database/130-study-rls.sql` (nuevo)
- `supabase/tests/database/120-study-schema.sql` (quita «cero políticas»)
- `docs/DATA_MODEL.md`, `docs/FSRS.md`, evidencia, `docs/STATUS.md`

Migraciones: **1**.

## 6. Siguiente

**LEX-5.6** — Ciclo de alta/activación de `LearningState`. No empezada.
