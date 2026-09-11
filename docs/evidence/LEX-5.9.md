# LEX-5.9 — Commit atómico de repaso

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-9-atomic-review-commit`
**Estado resultante:** `HECHO`. PR #84 fusionada a `main` (merge `70375ab`);
CI verde en los tres trabajos, runs `34610911009` (PR) y `34611485614`
(merge).

---

## 1. Alcance

Escribir de forma atómica el nuevo `learning_states` y un `review_logs`.
FSRS se calcula en la aplicación (LEX-5.8). **Sin UI.**

**Entregado:**

- ADR-006: RPC `SECURITY INVOKER` (no se reutiliza ADR-005).
- Migración `20260911180000_commit_review`.
- pgTAP `140-commit-review.sql` (16 aserciones).
- Caso de uso `confirmReview` + puerto `ReviewCommitter` + adaptador.

**Fuera de alcance:** idempotencia e2e (LEX-5.10); conflicto simultáneo
(LEX-5.11); UI.

## 2. Decisiones

- **ADR-006, no ADR-005.** El roadmap nombra ADR-005; ese ya es la
  creación de perfil. Esta es la homóloga para el commit.
- **`SECURITY INVOKER`**, `search_path` fijado. `revoke execute from
  public, anon`; `grant to authenticated`. Igual que
  `complete_onboarding`.
- **No `SECURITY DEFINER`.** Cerraría el `UPDATE` directo del dueño
  (LEX-5.5) pero salta RLS y pide revisión cruzada §12.3. Se aplaza.
- **No `service_role`.** No hay ese cliente en el servidor (LEX-1.8).
- El SQL no calcula FSRS. Recibe números ya calculados y aplica CHECKs.
- Misma clave de idempotencia → `{ok, replayed: true}` sin escribir.
- `revision` distinta → `{ok:false, reason: "revision-conflict"}`.
- Ítem ajeno / sin estado → `not-found` (RLS filtra el `SELECT FOR
  UPDATE`).
- El dueño sigue pudiendo `UPDATE` su estado por RLS; el producto no
  usa ese camino.

## 3. Tests

`140-commit-review.sql` (16): INVOKER + `search_path`; A confirma;
revision 2 y un log; misma clave reexpedida sin duplicar; revision
obsoleta no escribe; A no confirma el ítem de B; anon `42501`; B intacto.

Caso de uso (6): cálculo fallido no llama al committer; not-found /
archived / no-state / revision-conflict tampoco; éxito confirma y
relee; conflicto del committer no finge éxito; replayed es éxito;
snapshot ISO.

130 (RLS) sigue verde: las políticas UPDATE de LEX-5.5 se conservan
porque INVOKER las necesita.

## 4. Puertas

```text
pnpm db:reset  12 migraciones + seed desde vacío
pnpm db:test   15 ficheros / 455 aserciones, PASS (140 nuevo: 16)
pnpm db:types  regenerado en el mismo commit (`commit_review`)
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 54/343 + 1 skipped, build)
```

Sin e2e: no hay pantalla.

CI verde, tres trabajos: run `34610911009` (PR #84) y run `34611485614`
(merge).

## 5. Archivos

- `docs/adrs/ADR-006-commit-atomico-de-repaso.md` (nuevo)
- `supabase/migrations/20260911180000_commit_review.sql` (nuevo)
- `supabase/tests/database/140-commit-review.sql` (nuevo)
- `src/modules/study/application/confirm-review.ts` (+ test)
- `src/modules/study/infrastructure/supabase-review-committer.ts`
- `src/composition/study.ts`
- `src/shared/infrastructure/supabase/database.types.ts` (regenerado)
- `docs/DATA_MODEL.md`, `docs/FSRS.md`, evidencia

Migraciones: **1**.

## 6. Siguiente

**LEX-5.10** — Idempotencia extremo a extremo. No empezada.
