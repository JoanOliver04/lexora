# LEX-6.10 — Ciclo de vida de sesión

**Fecha:** 2026-10-16

**Rama / base:** `feat/lex-6-10-session-lifecycle` / `46628d8`

**Estado:** `HECHO` con evidencia local y revisión independiente, sin publicación.

## Entregado y decisiones

Transiciones explícitas de sesión, sin persistir una cola visual. Pausar conserva
el alcance y permite reanudar con los pendientes actuales; completar y abandonar
son terminales. Repetir una transición ya aplicada no renueva su fecha de cierre.
Una lectura, salir de la página o cerrar la pestaña no muta el estado. Todos los
repasos que el servidor confirmó se conservan independientemente de la sesión.

Completar exige consultar de nuevo una cola sin tarjetas disponibles. No afirma
haber terminado todo el estudio: el mensaje conserva la advertencia de pasos
futuros y repasos ocultos por los límites. Para detenerse con tarjetas disponibles
se usa pausa o abandono. No se implementan resúmenes ni contadores finales.

El servidor deriva identidad, curso guardado y reloj. La escritura de estado
compara propietario, ID y estado observado; un cambio concurrente no se pisa.
`ended_at` permanece nulo en active/paused y usa el reloj del servidor al cerrar,
nunca antes del inicio. La lista de sesiones abiertas está acotada a diez del
curso actual; Hoy mantiene acceso a ella incluso con cupos agotados. Las sesiones
anteriores siguen accesibles por su URL autorizada. No hay reanudación automática.

La UI bloquea estos cambios mientras se guarda un repaso o su resultado es
desconocido. También bloquea la recarga de estado en ese caso para conservar la
intención de reintento. Mientras cambia la sesión, los controles de tarjeta se
deshabilitan. Error de transporte no anuncia éxito; permite consultar o repetir
la transición, siempre reautorizada en servidor.

### Migración y compatibilidad

Una migración nueva: `20261016120000_session_commit_guard.sql`. Solo reemplaza
el cuerpo de `commit_review`, sin reescribir datos, cambiar firma, añadir roles
o elevar privilegios. Tras el replay toma `FOR UPDATE` sobre la sesión propia y
exige active antes de bloquear memoria y escribir estado/log. La actualización
de estado adquiere el mismo candado: si ganó la pausa, no se guarda un intento
nuevo; si ganó el repaso, la pausa espera a su commit. El camino sin sesión
asociada y los recibos previos siguen funcionando.

El payload conserva sus razones existentes para versiones anteriores de la
aplicación. El caso de uso también busca el recibo antes de rechazar una sesión
inactiva, comprobando ítem, sesión y rating. No se usa `service_role`, no se
reimplementa FSRS en SQL y no se amplían permisos. Las escrituras directas del
dueño siguen teniendo el límite ya documentado en ADR-006.

Despliegue futuro: migración primero, aplicación después. Rollback: deshabilitar
los controles y, si es necesario, restaurar la función de
`20260911190000_commit_review_idempotency.sql`; no borrar sesiones, memoria o
logs. No se ejecutó ese rollback ni una migración en producción.

En local estaban pendientes el catálogo ya existente y la guarda nueva:
`migration up --local` aplicó ambos, sin seed ni reset. Tipos regenerados sin
diff, porque firma y tablas no cambian. La prueba canónica del catálogo aplicó
las quince migraciones reales desde cero en una base local desechable con un
Auth mínimo de pruebas: quince aserciones verdes, sin seed. Después eliminó
únicamente esa base desechable; la base local habitual y la remota no se borraron.

**Dependencias: 0. ADR nuevos: 0.** ADR-006 recibe una aclaración de candado y
replay, sin cambiar su decisión. ADR-001/002/004 se mantienen. Lean-build acotó
el flujo a los contratos existentes; migration guió compatibilidad, orden y
recuperación sin pérdida; cavecrew aportó revisión independiente y
verify-and-stop limita el cierre a aceptación y regresiones.

## Archivos afectados

- Dominio `study-session.ts` y prueba de las dieciséis combinaciones de estado/acción.
- Aplicación `study-session.ts`, `save-session-review.ts` y sus tests; mocks del
  puerto en `study-card.test.ts`.
- Adaptador `supabase-study-session-repository.ts`: consulta acotada y compare-and-set.
- `session-actions.ts` y `.test.ts`, `session-controls.tsx`, `study-card-view.tsx`
  y `.test.tsx`: intención validada, estado pendiente, recuperación y bloqueo cruzado.
- Preparación, detalle de sesión y `dashboard-view.tsx`: estados y recuperación
  desde Hoy; mensajes ES/EN.
- Migración nueva y `supabase/tests/database/170-session-lifecycle.sql`.
- Integración Supabase de sesiones y auxiliar `local-session-lock.ts`.
- `tests/e2e/study-lifecycle.spec.ts`, regresión de pending en `study-review.spec.ts`
  y título de sesión activa en `today.spec.ts`.
- Arquitectura, FSRS, overview, ADR-006, estado, evidencia y roadmap privado.

## Evidencia ejecutada

```text
Regresión inicial: sesiones + guardado + UI
  3 files / 64 tests passed, exit 0

Dominio + aplicación + guardado + acción + UI
  5 files / 102 tests passed, exit 0

Integración real local y UI con las nuevas regresiones
  2 files / 31 tests passed, exit 0

pnpm exec supabase migration up --local
  catálogo anterior y guarda nueva aplicados; exit 0, sin seed/reset

pnpm db:types
  exit 0; tipos generados sin diff

pnpm db:test:catalogue
  15 real migrations / 15 assertions passed, exit 0, sin seed

pnpm db:test
  18 files / 489 assertions, PASS, exit 0

CI=1 pnpm e2e tests/e2e/study-lifecycle.spec.ts tests/e2e/study-review.spec.ts --workers=2 --retries=0
  4 passed, exit 0, 59.6 s

LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18 y build
  84 files passed + 1 skipped / 692 tests passed + 1 skipped

CI=1 pnpm e2e --workers=2 --retries=0
  120 passed + 4 skipped (casos privados preexistentes), exit 0, 2.5 min

pnpm format:check (cierre documental) y git diff --check
  exit 0
```

La integración usa dos transacciones PostgreSQL reales y barreras observables
mediante `pg_blocking_pids`, no una pausa de tiempo como prueba de concurrencia.
En un orden, la pausa mantiene bloqueada la sesión y el commit espera; al liberar
se rechaza sin cambiar memoria/logs. En el inverso se retiene la memoria: el
repaso ya posee el candado de sesión, la pausa espera detrás y solo termina
después de confirmar estado y log. El recibo puede recuperarse tras la pausa.
El auxiliar tiene timeouts locales de sentencia/candado/transacción inactiva y
verifica la salida del proceso; no configura el servidor de producción.

RLS: B y anon no pueden leer, reanudar, actualizar ni descubrir la sesión de A.
pgTAP prueba rechazo de intents nuevos con revisión válida en paused/completed/
abandoned, sesión inexistente, replay y preservación de revisión/log, además de
INVOKER y ausencia de EXECUTE para anon. Las regresiones previas siguen incluidas.

El navegador guarda un repaso, pausa y recarga; encuentra la sesión desde Hoy
con ambos cupos a cero. Otro dispositivo modifica el pendiente: al reanudar se
carga el frente actual, sin revelar ni repetir el orden anterior. Completa una
sesión y abandona otra pausada; ambas permanecen cerradas y conservan los logs.
Las capturas de pausa/cierre inspeccionadas son de escritorio y Poco F5 emulado,
no de un dispositivo físico. Artefactos ignorados en `test-results/`.

La revisión detectó y corrigió dos casos: recarga de estado que podía descartar
una intención de repaso incierta (regresión añadida) y timeout insuficiente del
auxiliar de locks (acotado en PostgreSQL). Revisión final sin hallazgos pendientes.
Se corrigieron también ubicación/tipos de métodos, formato y un CTE de prueba
que debía estar en nivel superior. No se desactivaron tests ni reglas.

## Límites

Sin seed, reset local/remoto, push, CI remota, cambio de plan o producción.
Ningún dato real se migra o elimina. No hay dependencias, cola offline, Realtime
ni cambios en el cálculo FSRS. La migración nueva está pendiente de producción.
No se requiere acción manual para este cierre local; las pruebas físicas y de
lector de pantalla quedan en sus gates específicos. Q-005/Q-006/Q-008 no cambian.
Entrega conservada en un commit local de esta rama. `main` y producción no
cambian; LEX-6.11 no se inicia. Diff completo revisado, incluidos SQL y tipos.
Los 84 enlaces Markdown relativos de los 31 archivos afectados resuelven;
sin patrones de credenciales detectados en ellos. Variables, documentos
privados y artefactos de pruebas siguen ignorados.

Fuentes: documentación de Server Actions y `revalidatePath` de la versión
Next.js instalada, [candados de PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html)
y [CLI de Supabase](https://supabase.com/docs/reference/cli/supabase-migration-up).
