# LEX-6.7 — Guardado inmediato de valoraciones

**Fecha:** 2026-10-11  
**Rama / base:** `feat/lex-6-7-immediate-review-save` / `8bce8ae`  
**Estado:** `HECHO` con evidencia local y revisión independiente.
Sin publicación ni cambios en producción.

## Entregado

La valoración se envía después de revelar, con revisión observada y clave UUID.
El servidor obtiene identidad, zona, reloj y configuración, reautoriza sesión
activa/primer pendiente y reutiliza `confirmReview` y la RPC atómica existente.
Memoria y log quedan persistidos antes de confirmar; el log incluye la sesión.
No se calculan vencimientos en el cliente ni se aceptan snapshots enviados por él.

La UI bloquea el doble envío, conserva tarjeta y respuesta mientras guarda y
solo muestra el siguiente frente tras confirmación y revalidación. El aviso
discreto de guardado persiste también al agotarse la cola disponible. El foco
se mueve al nuevo frente o a la confirmación final. Un error tipado no anuncia
éxito: mantiene la intención para reintentar o permite recargar desde servidor.

Los replays comprueban ítem, sesión y rating, antes de reconstruir la cola y
tras carreras. Una clave confirmada funciona aunque el ítem haya salido de la
cola. Un intento nuevo con revisión antigua no sobrescribe memoria ni adopta
la revisión actual silenciosamente. No hay cola offline.

Archivos principales:

- `src/modules/study/application/save-session-review.ts` y su test: autorización,
  intención validada, memoria inicial y commit/replay.
- `src/app/[locale]/(app)/app/study/review-actions.ts` y su test: acción delgada,
  errores seguros, recibo y revalidación.
- `study-card-view.tsx` y su test en esa carpeta: pending, bloqueo síncrono,
  reintento, reset de reveal, foco y confirmación persistente entre frentes.
- `study-card.ts`, `reveal-actions.ts`, `src/composition/study.ts`: revisión en
  la proyección y clave creada tras el reveal compatible.
- `confirm-review.ts`, `supabase-review-committer.ts`: lectura de la sesión del
  recibo existente; la escritura SQL no cambia.
- `tests/unit/study/session-review-supabase.integration.test.ts`: FSRS/RPC real,
  RLS A/B/anon, conflictos y carrera concurrente.
- `tests/e2e/study-review.spec.ts`: guardado, replay HTTP y cierre de pestaña.
  `study-renderer.spec.ts` conserva su propósito de verificar reveal sin writes.
- `.github/workflows/ci.yml`: integración de guardado en el trabajo de base de
  datos, manteniendo los tres nombres de checks obligatorios.
- Mensajes ES/EN, README, arquitectura, contrato FSRS, overview y estado público.

**Migraciones: 0. Dependencias: 0. ADR nuevos/modificados: 0.** Se reutilizan
ADR-001/003/004/006. Lean-build limitó el cambio al flujo existente;
verify-and-stop limitó el cierre a sus pruebas de aceptación.

## Evidencia ejecutada

```text
Pruebas enfocadas finales (aplicación + acción + UI)
  3 files / 63 tests passed, exit 0

Integración Supabase local enfocada
  5 tests passed (incluidos también en el gate general)

LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18, build
  79 files passed + 1 skipped / 608 tests passed + 1 skipped

pnpm db:test
  17 files / 477 assertions, PASS, exit 0

pnpm format:check (después del cierre documental)
  exit 0

CI=1 pnpm e2e tests/e2e/study-review.spec.ts tests/e2e/study-renderer.spec.ts --workers=1 --retries=0
  4 passed, exit 0 (antes del ajuste final de foco/recarga)

CI=1 pnpm e2e --workers=2 --retries=0
  110 passed + 4 skipped (casos privados preexistentes), exit 0, 2.2 min
```

El primer gate encontró formato pendiente en el test de integración; se corrigió
con Prettier y el gate completo posterior pasó. No se han omitido pruebas para
conseguir verde. El skip unitario preexistente corresponde a material privado.
Los fixtures nuevos rechazan cualquier destino distinto de Supabase local en
el puerto 54321 y limpian únicamente su curso sintético, nunca datos del dueño.
No se ejecutó seed local, reset, migración, ni comando contra producción.

El E2E retiene la petición antes del commit y comprueba controles deshabilitados,
misma tarjeta y cero logs. Tras confirmar, consulta memoria durable y repite el
POST original: mismo estado y un solo log. Cierra la pestaña y abre otra sin
estado React previo: aparece el siguiente pendiente. Al completar los cuatro
ratings quedan cuatro logs, cuatro estados revisados y cero ítems disponibles.
La integración verifica además dos envíos concurrentes con una única clave.
Capturas de pending, siguiente frente y cola vacía inspeccionadas en escritorio
y Poco F5 emulado, sin solapamiento ni desbordamiento visible. Artefactos
sintéticos en `test-results/`, ignorados por Git.

## Revisión y límites

Revisión independiente de solo lectura: encontró un error recuperable del
contexto fuera del `try`; corregido y cubierto por regresión. Segunda revisión
del árbol final de producto: ningún hallazgo pendiente. No sustituye las pruebas
ejecutadas. Revisados también replay concurrente, límites, campos falsificados,
aislamiento y ausencia de avance optimista.

Diff completo revisado: sin SQL, cambios de esquema, lockfile, tipos generados,
configuración FSRS ni variables de entorno modificados. Documentos privados,
`.env.local` y resultados de pruebas permanecen ignorados. Árbol de trabajo
con cambios exclusivamente de esta tarea, sin commit ni push.
Comprobación final: `git diff --check` sin errores; 93 enlaces Markdown relativos
válidos en la documentación afectada y ningún patrón de clave privada/token
en los archivos cambiados o nuevos que Git incluiría.

La publicación y CI remota de esta rama no se han ejecutado. La producción
permanece en el código anterior verificado. No se declaran pruebas físicas de
Poco F5 ni lector de pantalla físico; permanecen en sus gates específicos.
La pestaña debe esperar la confirmación antes de cerrarse. Recuperación completa
de desconexión/timeout, ciclo de vida de sesión y cierre automático no forman
parte de esta entrega. LEX-6.8 no se inicia. Q-005/Q-006/Q-008 no cambian.
