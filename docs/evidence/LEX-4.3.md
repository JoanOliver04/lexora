# LEX-4.3 — Crear `import_jobs` e `import_job_errors`

**Fecha:** 2026-09-05
**Rama:** `feat/lex-4-3-import-jobs`
**Estado resultante:** `EN PROCESO` → `HECHO` al fusionar con CI verde.

---

## 1. Alcance

El parser de LEX-4.2 devuelve filas y errores pero **no persiste nada**.
Esta tarea crea dónde: `import_jobs` (un trabajo de importación) e
`import_job_errors` (los fallos por fila), según MASTER_SPEC §13.14 y
§16.2–16.3. Estructura + RLS en una sola migración, patrón de LEX-3.2 +
LEX-3.3 pero condensado porque las dos tablas son pequeñas y siempre llegan
juntas.

**Migración `20260905180000_import_jobs.sql`:**

- **Enums:** `import_status` (`pending`/`mapping`/`importing`/`completed`/
  `failed` — el ciclo de vida del flujo §9.7; `completed` con
  `rows_failed > 0` no es lo mismo que `failed`, que es abortar antes de
  terminar). `import_error_code` (`too_few_columns`/`too_many_columns`/
  `front_empty`/`back_empty` — los cuatro del `domain/` de LEX-4.2;
  LEX-4.5 añade los de validación con `alter type ... add value`).
- **`import_jobs`:** `owner_id` denormalizado + FK compuesta `(course_id,
  owner_id) → courses (id, owner_id)` y `(deck_id, owner_id) → decks (id,
  owner_id)`. `deck_id` nulable, `on delete set null (deck_id)` — si se
  borra el mazo de destino el trabajo sobrevive con `deck_id` nulo
  (historial); la lista de columnas es obligatoria (PG 15+). `original_
  filename` (saneado en LEX-4.5, aquí solo se guarda; CHECK 1..255),
  `content_hash` (CHECK 1..128), `mapping_config` JSONB CHECK objeto, cinco
  contadores CHECK `>= 0`, trigger `set_updated_at`.
- **`import_jobs` no tiene columna de contenido** — el archivo no se guarda
  (§13.14: «no se conservará el archivo completo indefinidamente» → para la
  V1, no se conserva). `hasnt_column` lo prueba.
- **`import_job_errors`:** `owner_id` denormalizado + FK compuesta
  `(import_job_id, owner_id) → import_jobs (id, owner_id) on delete
  cascade`. `row_number` CHECK `>= 1`, `code` (enum), `message` CHECK
  1..500 (seguro, §16.3), `row_sample` opcional CHECK `<= 500` (acotada y
  saneada, §13.14). Escrita una vez, sin `updated_at`, sin trigger.
- **RLS:** `import_jobs` con las cuatro operaciones (las transiciones de
  estado son `UPDATE`); `import_job_errors` con `SELECT`/`INSERT`/`DELETE`,
  **sin `UPDATE`** (patrón de `concept_tags` — la fila no se edita). Todas
  `(select auth.uid()) = owner_id` envuelto → InitPlan. `force row level
  security` **no** (patrón LEX-2.3/3.3).
- **Índices:** `(owner_id)` en ambas (predicado de RLS);
  `import_jobs (course_id)` (respaldo de la FK sin PK que lo cubra);
  `import_job_errors (import_job_id)` (listar los errores de un trabajo).
- `database.types.ts` regenerado en el mismo commit (+128 líneas; `git
  diff` limpio al re-ejecutar).

**Fuera de alcance, declarado:**

- El repositorio / caso de uso que escribe en estas tablas — LEX-4.4+
  cuando exista un flujo que ejecute una importación. Nada de TypeScript
  del módulo `importing` se toca aquí.
- Saneamiento real del nombre de archivo, el mensaje y la muestra
  (LEX-4.5, §16.2–16.3) — las columnas solo guardan el resultado y ponen
  el tope de longitud como último guardián.
- `alter type import_error_code add value` para los códigos de validación
  — LEX-4.5.

## 2. Tests

**pgTAP `supabase/tests/database/110-import-jobs.sql`** (nuevo, 42
aserciones, autocontenido — usuarios e idiomas `zz` propios, como 040/090):

- Estructura: ambas tablas existen; `import_jobs` **no** tiene columna
  `content`; los dos enums tienen sus labels exactas; `status` por defecto
  `pending`; trigger `set_updated_at`.
- Cada CHECK rechazando su valor (`23514`): contador negativo,
  `mapping_config` no-objeto, filename en blanco, `content_hash` largo,
  `row_number < 1`, `message` largo, `row_sample` largo.
- FK compuesta entre usuarios (`23503`): A no puede abrir un trabajo contra
  el curso de B; A no puede colgar un error del trabajo de B.
- Cascada: borrar un trabajo se lleva sus `import_job_errors`. `set null`:
  borrar el mazo de destino deja el trabajo con `deck_id` nulo.
- Juego de políticas exacto por tabla (`bag_eq`), «≥1 política» acotado a
  las dos tablas nuevas (no se amplía `010`, mismo criterio que LEX-3.3).
- RLS funcional: A ve solo su trabajo y su error, no los de B ni por UUID
  conocido; A avanza estado y contadores de lo suyo; A insertando con
  `owner_id` de B → `42501`; el `UPDATE` de A contra el trabajo de B es un
  no-op silencioso (confirmado en el bloque B: sigue `pending`); anon no ve
  nada y no puede insertar; **caso dueño y caso no-dueño**, como exige
  CLAUDE.md §2.

`pnpm test` (vitest) sin cambios: esta tarea no toca TypeScript.

## 3. Verificación por rotura

Se quitó `and rows_failed >= 0` del CHECK `import_jobs_counters_non_negative`
y se relanzó `pnpm db:reset && pnpm db:test`: fallan **exactamente dos**
aserciones — la 8 («a negative counter is rejected», el `throws_ok` que ya
no lanza) y la 27 («A sees exactly its own job», porque ese `throws_ok` al
no lanzar deja su fila insertada en la fixture, y A pasa a ver 2 trabajos).
Ambas trazables al mismo CHECK quitado, nada más perturbado. Restaurado →
42/42 y `db:types` sin cambios al re-ejecutar.

## 4. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 31/223, build)
pnpm db:reset  7 migraciones + seed desde vacío, sin pasos manuales
pnpm db:test   12 ficheros / 308 aserciones, PASS (110 nuevo: 42)
pnpm db:types  regenerado en el mismo commit; +128 líneas; git diff limpio al re-ejecutar
```

Sin `pnpm e2e`: no hay pantalla todavía (LEX-4.4).

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260905180000_import_jobs.sql` | Nueva. `import_jobs` + `import_job_errors` + enums + RLS. |
| `supabase/tests/database/110-import-jobs.sql` | Nuevo. 42 aserciones. |
| `src/shared/infrastructure/supabase/database.types.ts` | Regenerado (+128). |
| `docs/DATA_MODEL.md` | §«Importación» concreta: sin columna de contenido, FK compuesta, `set null`, RLS, pgTAP `110`. |
| `docs/evidence/LEX-4.3.md` | Este informe. |

Migraciones: **1**.

## 6. Riesgos y deuda

- **`import_error_code` como enum:** LEX-4.5 tendrá que hacer `alter type
  ... add value` para cada código de validación. Es transaccional en PG 12+
  pero el valor nuevo no se puede usar en la misma transacción que lo
  añade — LEX-4.5 lo hará en su propia migración, no mezclado con datos.
- **`mapping_config` sin CHECK de forma discriminada:** solo se comprueba
  que es un objeto JSON. La forma real (qué columna es frente, reverso,
  tags, si se crea inversa) la valida la aplicación con Zod (§16.2) cuando
  LEX-4.4 la defina; añadir un CHECK SQL rígido ahora, sin saber la forma
  final, sería adelantarse.
- **Retención por tiempo no implementada:** §13.14 dice «no
  indefinidamente». Para la V1 no se guarda el archivo, así que lo único
  que crece son filas de metadatos; un borrado por antigüedad (job/cron) se
  añade si el volumen lo pide, no antes.
- Deuda arrastrada: revisión cruzada independiente §3.6 (FASE 4). Sin
  segundo agente — mismo motivo ambiental que `docs/evidence/LEX-3.12.md` §4.

## 7. Estado del árbol Git

Rama `feat/lex-4-3-import-jobs` desde `main` (`f5ae807`). Pendiente: commit,
PR contra `main`, CI verde en los tres trabajos, merge, CI verde en `main`,
cierre docs.

## 8. Siguiente tarea

**LEX-4.4** — Implementar preview y mapeo de columnas: detecta cabecera/
separador, muestra filas limitadas y permite mapear frente/reverso/tags/
campos opcionales sin persistir cambios. Depende de LEX-4.2. No se inicia
aquí.
