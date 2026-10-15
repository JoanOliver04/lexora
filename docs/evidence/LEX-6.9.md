# LEX-6.9 — Pasos cortos de aprendizaje

**Fecha:** 2026-10-15

**Rama / base:** `feat/lex-6-9-short-learning-steps` / `3ca6c71`

**Estado:** `HECHO` con evidencia local y revisión independiente, sin publicación.

## Entregado y decisiones

La cola conserva el orden Learning/Relearning vencidos → Review → New y añade
`nextLearningDueAt` para distinguir un paso corto futuro de un Review sujeto
al cupo diario. Reutiliza los candidatos autorizados y filtrados; no añade
consultas ni modifica los límites o el cálculo FSRS existente.

La página captura un solo instante del servidor para construir la cola y
calcular el tiempo restante. Con cola vacía y un paso corto futuro muestra una
aproximación en minutos de la última comprobación. No es una cuenta atrás ni
usa el reloj del dispositivo para admitir tarjetas. Con otro trabajo disponible
se continúa estudiando sin mostrar una espera.

El usuario puede comprobar pendientes mediante `router.refresh()` o volver a
Hoy sin perder los repasos confirmados. La transición bloquea solo el botón
de consulta, no el enlace para salir. No hay temporizadores, sondeo automático,
Realtime, cola offline ni cambios del ciclo de vida de sesión. La consulta
reconstruye la cola autorizada; al reaparecer un paso se exige revelar de nuevo
antes de valorar, con revisión vigente y nueva clave de idempotencia.

Archivos afectados:

- `src/modules/study/domain/queue.ts` y `.test.ts`: pista de próximo paso,
  selección independiente de Review y frontera exacta de vencimiento.
- `src/modules/study/application/study-card.test.ts`: antes/en/después del
  vencimiento, prioridad y trabajo alternativo.
- Página `[sessionId]/page.tsx`, `study-step-wait.tsx` y `.test.tsx` en la
  carpeta de estudio: duración del servidor, consulta manual y salida ES/EN.
- `tests/unit/study/session-review-supabase.integration.test.ts`: dos fases
  reales FSRS, RLS, límites, reveal/commit temprano rechazados y replay.
- `tests/e2e/study-short-steps.spec.ts`: ambas fases, reloj del navegador
  adelantado, reaparición, nuevo reveal y dos commits únicos.
- Traducciones ES/EN, arquitectura, FSRS, overview, estado y roadmap privado.

**Migraciones: 0. Dependencias: 0. ADR nuevos o modificados: 0.**
Se mantienen ADR-001/003/004/006. Lean-build acotó el cambio a la cola y sesión
existentes; investigate-first separó una carrera del test de un fallo de
producto; verify-and-stop limita el cierre a los criterios y sus regresiones.
Revisión independiente estática del producto y sincronización del E2E sin
hallazgos pendientes; no sustituye las pruebas ejecutadas.

## Evidencia ejecutada

```text
Dominio + aplicación + UI + integración Supabase real local
  4 files / 48 tests passed, exit 0

LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18 y build
  82 files passed + 1 skipped / 650 tests passed + 1 skipped

pnpm db:test
  17 files / 477 assertions, PASS, exit 0

pnpm format:check (tras el cierre documental) y git diff --check
  exit 0

CI=1 pnpm e2e tests/e2e/study-short-steps.spec.ts --workers=2 --retries=0
  4 passed, exit 0, 29.0 s

CI=1 pnpm e2e --workers=2 --retries=0
  118 passed + 4 skipped (casos privados preexistentes), exit 0, 2.3 min
```

La integración usa el scheduler y la escritura atómica reales. `Again` deja
Learning a un minuto y Relearning a diez. Antes del vencimiento existe otro New
disponible; al agotar ambos cupos, la cola queda vacía con su pista temporal.
Un milisegundo antes del vencimiento no admite reveal ni commit. En el instante
exacto entra con revisión 2, incluso con ambos cupos a cero; Good confirma la
revisión 3. Repetir la intención inicial devuelve el recibo original sin otro
log: dos repasos únicos. B y anon no leen la sesión ni su pista temporal.

El E2E adelanta solo el reloj del navegador un día y confirma que no entra el
paso temprano ni cambia memoria/logs. Después adelanta únicamente `due_at` de
su fixture sintética para probar la reaparición sin esperar diez minutos reales;
no se afirma haber esperado ese intervalo en navegador. La frontera temporal
exacta se prueba con el reloj inyectado en dominio, aplicación e integración.
La nueva tarjeta oculta la respuesta, enfoca el frente y exige reveal nuevo.

La primera pasada dirigida detectó una carrera en el test: una respuesta RSC
ajena podía satisfacer la espera y la fecha sintética cambiaba antes del commit
de la interfaz. Esperar el cierre del stream tampoco servía: podía quedar abierto
aunque la UI ya estuviera lista. El test final identifica la respuesta de la
sesión y espera el botón normal habilitado antes de modificar la fixture. La
ejecución posterior pasó sin reintentos ni cambios de lógica de producto.
El primer gate general detectó formato pendiente en dos archivos de pruebas;
Prettier lo corrigió y el gate completo posterior pasó.

Capturas de ambas fases inspeccionadas en escritorio y Poco F5 emulado, sin
desbordamiento visible. Artefactos ignorados en `test-results/` y
`playwright-report/`. Preparación y limpieza limitadas a cursos sintéticos
propios, con guardas que exigen Supabase local en el puerto 54321.

## Límites y estado de entrega

No seed local, reset, SQL, push, CI remota ni operación de producción.
Sin cambios de configuración FSRS, tipos generados o lockfile. No se actualizan
variables, planes o dependencias. Q-005/Q-006/Q-008 permanecen sin cambios.
Diff completo revisado; 82 enlaces Markdown relativos comprobados y ningún
patrón de credenciales detectado en los 15 archivos de la entrega. Documentos
privados, variables locales y artefactos siguen ignorados. Entrega conservada
en un commit local de esta rama; `main` y la producción anterior no cambian.
No hay acciones manuales necesarias para este cierre local. Las pruebas físicas
de Poco F5 y lector de pantalla quedan en sus gates específicos; no se declaran
ejecutadas aquí. LEX-6.10 no se inicia.

Fuentes técnicas: documentación `useRouter` de la versión Next.js instalada y
[reloj fijo de Playwright](https://playwright.dev/docs/clock#test-with-predefined-time).
