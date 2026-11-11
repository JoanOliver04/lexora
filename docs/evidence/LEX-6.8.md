# LEX-6.8 — Recuperación del guardado

**Fecha:** 2026-10-15

**Rama / base:** `feat/lex-6-8-review-recovery` / `9f90b58`

**Estado:** `HECHO` con evidencia local y revisión independiente, sin publicación.

## Entregado y decisiones

El guardado mantiene la tarjeta y la intención mientras espera confirmación.
Una desconexión o timeout no se interpreta como rollback: el servidor puede
haber confirmado ya. El reintento manual conserva clave, rating y revisión.
No permite cambiar la valoración de un intento incierto ni anuncia éxito hasta
validar el recibo. Un conflicto exige recargar la cola autoritativa, sin
sobrescribir el progreso que otro dispositivo haya guardado.

La UI usa `POST /api/study/reviews` en vez de la Server Action de escritura.
Este contrato HTTP permite abortar la espera con `AbortController` a los 15 s,
incluida la lectura del cuerpo, y decidir cuándo refrescar la ruta. No se intenta
revertir una transacción al abortar el navegador. La lógica de negocio sigue
en `saveSessionReview` y la RPC atómica existente, sin cambios.

El endpoint valida el Origin configurado, formato y límite real de 2048 bytes
antes de acceder a datos; no confía en Host reenviado. Omite metadatos adicionales
y rechaza campos obligatorios duplicados. Identidad por cookies verificadas en
cada petición; sesión caducada devuelve 401. Respuestas `private, no-store`.
El cliente valida estructura, clave y rating del recibo antes de mostrar éxito;
una respuesta inválida, HTML o fallo de red es recuperable sin detalles privados.

Los eventos de conexión bloquean controles cuando el navegador informa offline.
Son un indicio, no una prueba de acceso al servidor. Reconectar no envía nada.
No hay localStorage, IndexedDB, service worker ni cola offline. La intención solo
se conserva en la pestaña abierta. El reveal sigue siendo una Server Action de
lectura y recupera un rechazo de transporte sin desmontar la tarjeta.

Archivos principales:

- `src/app/api/study/reviews/route.ts` y `.test.ts`: límite HTTP autenticado,
  protección de origen, límites y estados seguros.
- `review-handler.ts` y `.test.ts` en la carpeta de estudio: límite de servidor
  trasladado desde `review-actions`, con el mismo caso de uso y revalidación.
- `review-request.ts`, `.test.ts`, `review-state.ts` en esa carpeta: contrato,
  fetch abortable, validación y preservación de intención.
- `study-card-view.tsx` y `.test.tsx`: offline, reintento explícito, foco,
  conflictos y bloqueo de la tarjeta confirmada mientras llega la cola nueva.
- `tests/e2e/study-recovery.spec.ts`: timeout después del commit real, replay,
  conflicto con otro dispositivo, offline y seguridad HTTP.
- `tests/e2e/study-review.spec.ts`: conserva las cuatro valoraciones, replay y
  persistencia al cerrar la pestaña confirmada usando el nuevo transporte.
- Mensajes ES/EN, arquitectura, FSRS, overview y estado. Checkpoint anterior
  anotado en `LEX-6.7.md`; roadmap privado actualizado y fuera de Git.

**Migraciones: 0. Dependencias: 0. ADR nuevos: 0.** ADR-006 recibe una aclaración
del transporte, sin cambiar la decisión ni los permisos. ADR-001/004 se conservan.
Lean-build limitó la implementación al guardado existente; verify-and-stop
limitó la validación a sus criterios y regresiones. Revisión independiente del
diff de producto: ningún hallazgo concreto de corrección, seguridad o carreras.

## Evidencia ejecutada

```text
Regresión inicial LEX-6.7: aplicación + acción + UI
  3 files / 63 tests passed, exit 0

Pruebas enfocadas: transporte + límite de servidor + UI + endpoint
  4 files / 65 tests passed, exit 0

LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18 y build
  81 files passed + 1 skipped / 637 tests passed + 1 skipped

pnpm db:test
  17 files / 477 assertions, PASS, exit 0

pnpm format:check (después del cierre documental)
  exit 0

CI=1 pnpm e2e tests/e2e/study-review.spec.ts tests/e2e/study-recovery.spec.ts --workers=2 --retries=0
  6 passed, exit 0, 36.6 s

CI=1 pnpm e2e --workers=2 --retries=0
  114 passed + 4 skipped (casos privados preexistentes), exit 0, 3.0 min
```

La primera pasada de navegador detectó un selector de test ambiguo entre la
alerta propia y el anunciador de rutas de Next.js; se acotó al error de guardado
y la ejecución posterior pasó. El primer gate detectó que el parámetro `use`
de una fixture Playwright se interpretaba como hook de React; se renombró sin
desactivar reglas. También se ajustó el tipado de la preparación de Auth, sin
`any`. No se han desactivado pruebas ni añadido reintentos para conseguir verde.

La prueba dirigida hace commit real reteniendo su respuesta. Tras abortar la
espera, conserva la misma tarjeta y muestra resultado desconocido. El reintento
envía exactamente el mismo cuerpo: un log, misma revisión y mismo estado FSRS.
Después, otro dispositivo confirma el siguiente ítem: la pestaña antigua recibe
conflicto, no escribe otro log y recarga el frente vigente. La API real rechaza
anon, origen ajeno y cuerpo excesivo. Los fixtures solo aceptan Supabase local
en el puerto 54321 y limpian únicamente sus cursos sintéticos.

Latencia local de cuatro pasos POST de commit real del informe dirigido:
209–288 ms (escritorio 288/215 ms, móvil emulado 279/209 ms). Son mediciones
locales de Playwright, no latencia de producción ni un benchmark estadístico.
Timeout acelerado con el reloj del navegador; el reloj del servidor y FSRS no
se alteran. Capturas de resultado desconocido y conflicto inspeccionadas en
escritorio y Poco F5 emulado, sin desbordamiento visible. Artefactos ignorados
en `test-results/` y `playwright-report/`.

## Límites y estado de entrega

No se ejecutó seed local, reset, migración, push ni operación de producción.
Tampoco se actualizan dependencias ni se cambian variables o planes.
No hay cambios en SQL, tipos generados, lockfile ni configuración FSRS.
Diff completo revisado, incluidos traslados de archivos y pruebas. Sin patrones
de credenciales en los archivos afectados; 80 enlaces Markdown relativos válidos
en la documentación final afectada. Documentos privados, `.env.local` y
artefactos de pruebas ignorados. Entrega conservada en un commit local de esta
rama; no se publica ni se altera `main`.
La producción sigue en la entrega anterior aceptada; esta rama no tiene CI remota.
Las pruebas físicas de Poco F5 y lector de pantalla pertenecen a sus gates
específicos; no se declaran realizadas aquí.

Debe mantenerse abierta la pestaña mientras un resultado sea incierto. Cerrar o
recargar descarta la intención en memoria; los repasos que ya confirmó el
servidor permanecen. No hay recuperación offline persistente ni envío en segundo
plano. La instalación/PWA y el ciclo de vida de sesión no cambian.
Q-005/Q-006/Q-008 permanecen sin cambios. LEX-6.9 no se inicia.

Fuentes técnicas: documentación de Server Actions y Route Handlers de la versión
Next.js instalada, [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort)
y [control de red de Playwright](https://playwright.dev/docs/network#handle-requests).
