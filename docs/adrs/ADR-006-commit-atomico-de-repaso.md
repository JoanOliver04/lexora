# ADR-006 — El commit de un repaso es una RPC SECURITY INVOKER

**Estado:** Aceptado
**Fecha:** 2026-09-11
**Decide:** propietario del proyecto (recomendación aplicada en LEX-5.9)

## Contexto

Cada valoración debe escribir de forma atómica el nuevo `learning_states` y
un `review_logs`. MASTER_SPEC §14.5 pide decidir en un ADR si esa escritura
se invoca **con RLS como usuario autenticado** o con un **adaptador de
servidor de privilegio mínimo**. ROADMAP LEX-5.9 nombra «ADR-005»; ese ADR
ya existe (creación de perfil) y no se reutiliza. Esta es la decisión
homóloga para el commit de repaso.

La aplicación calcula la transición con `ts-fsrs` (LEX-5.8). PostgreSQL no
reimplementa FSRS. Sí debe verificar propiedad, `revision` esperada, rating
permitido e idempotencia antes de escribir.

Dos riesgos:

1. Dos round-trips PostgREST (update + insert) pueden dejar estado sin log
   si la petición se corta a medias.
2. Una función `SECURITY DEFINER` salta RLS. El gate §12.3 y ADR-005 la
   evitan en la V1 salvo necesidad real y revisión cruzada, que no está.

El cliente visual no debe enviar `due_at` / `stability` / `difficulty`. El
camino de producto es Server Action → caso de uso → RPC. Hoy el dueño ya
puede `UPDATE` su `learning_states` por RLS (LEX-5.5); cerrar ese agujero
exigiría DEFINER + quitar la política UPDATE, y se aplaza por la misma
razón que ADR-005.

## Decisión

**Función `public.commit_review(...)` SECURITY INVOKER**, una transacción,
`search_path` fijado. La llama el adaptador de servidor con la sesión del
usuario (`createSupabaseServerClient`), nunca el navegador de forma
directa en el diseño de producto.

- `auth.uid()` es el dueño. Sin sesión → `28000`.
- Si `(owner_id, idempotency_key)` ya existe, devuelve el resultado
  anterior (`replayed`).
- Si `revision` no coincide, `{ ok: false, reason: "revision-conflict" }`.
- Si no hay estado, `{ ok: false, reason: "not-found" }`.
- En éxito: `UPDATE` del estado, `revision + 1`, `INSERT` del log.
- `revoke execute from public, anon`; `grant to authenticated`.
- Los números FSRS los envía el caso de uso (ya calculados). El SQL
  aplica CHECKs de columna, no la fórmula.

## Alternativas consideradas

**SECURITY DEFINER + quitar política UPDATE.**
Cerraría el `UPDATE` directo del dueño. Descarta en V1: salta RLS, pide
revisión cruzada §12.3, y ADR-005 ya rechazó DEFINER por lo mismo.
Reabrir si un abuso real de PostgREST lo justifica.

**Dos llamadas PostgREST en el adaptador.**
No es atómico. Un corte entre ellas deja memoria sin log.

**Adaptador `service_role`.**
Privilegio de más. No hay cliente `service_role` en el servidor a
propósito (LEX-1.8). No se introduce para esto.

## Consecuencias

- Un solo round-trip de escritura.
- El dueño sigue pudiendo `UPDATE` su fila por RLS; el producto no lo
  usa. El log append-only y la `revision` viven en la RPC.
- LEX-5.10/5.11 prueban idempotencia y conflicto sobre esta función.

## Cómo se verifica

pgTAP: INVOKER, `search_path`, dueño confirma, misma clave no duplica,
`revision` distinta no escribe, otro usuario no confirma lo ajeno, anon
sin `EXECUTE`.

## Cuándo reabrir esta decisión

Si hace falta impedir el `UPDATE` directo del dueño, o si llega la
revisión cruzada de funciones `SECURITY DEFINER`.
