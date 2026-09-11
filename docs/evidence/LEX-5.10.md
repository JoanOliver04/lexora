# LEX-5.10 — Idempotencia extremo a extremo del commit de repaso

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-10-review-idempotency`
**Estado resultante:** `EN PROCESO` (CI y fusión pendientes).

---

## 1. Alcance

Mismo `idempotency_key` → mismo resultado y un solo log. Claves de
dueños distintos no colisionan. Doble clic / reintento de red cubiertos.
**Sin UI.**

**Entregado:**

- Migración `20260911190000_commit_review_idempotency` (`CREATE OR
  REPLACE` de `commit_review`: candado de transacción + relectura del
  log).
- pgTAP `150-commit-review-idempotency.sql` (14 aserciones).
- `confirmReview` consulta la clave **antes** de calcular.

**Fuera de alcance:** conflicto entre dispositivos (LEX-5.11); UI.

## 2. Decisiones

- **Hueco de LEX-5.9:** un reintento con la `revision` original llegaba
  a `reviewPracticeItem` y devolvía `revision-conflict` sin llamar a la
  RPC, que sí habría reexpedido.
- **Lookup primero** en el caso de uso. Si hay log, se relee el estado
  del ítem original, no se llama al planificador ni se escribe.
- **Candado `pg_advisory_xact_lock(hashtext(uid), hashtext(clave))`**
  para serializar reintentos concurrentes de la misma clave. Dos dueños
  no comparten candado: la unicidad es `(owner_id, idempotency_key)`.
- Reutilizar la clave en otro ítem del mismo dueño reexpide el original
  y no toca el segundo ítem.
- Firma de la RPC sin cambios; tipos generados idénticos.

## 3. Tests

`150` (14): primer envío; reintento con revision obsoleta y rating
distinto reexpide; un log; vencimiento original; otro ítem con la
misma clave no escribe; B usa la misma clave y tiene su log; A intacto.

Caso de uso: clave vacía rechazada; lookup hit no calcula ni escribe
(reintento de red); los caminos de LEX-5.9 siguen verdes.

## 4. Puertas

```text
pnpm db:reset  13 migraciones + seed desde vacío
pnpm db:test   16 ficheros / 469 aserciones, PASS (150 nuevo: 14)
pnpm db:types  sin cambios (REPLACE de función, misma firma)
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 54/345 + 1 skipped, build)
```

Sin e2e: no hay pantalla.

## 5. Archivos

- `supabase/migrations/20260911190000_commit_review_idempotency.sql`
- `supabase/tests/database/150-commit-review-idempotency.sql`
- `src/modules/study/application/confirm-review.ts` (+ test)
- `src/modules/study/infrastructure/supabase-review-committer.ts`
- `docs/FSRS.md`, `docs/DATA_MODEL.md`, evidencia

Migraciones: **1** (`CREATE OR REPLACE`, no tabla nueva).

## 6. Siguiente

**LEX-5.11** — Concurrencia optimista entre dispositivos. No empezada.
