# LEX-6.3 — Alcance y creación de sesiones

**Fecha:** 2026-10-06
**Rama / base:** `feat/lex-6-3-study-session` / `cc98478`
**Estado resultante:** `HECHO` con evidencia local: gate general, pgTAP y E2E completo verdes.
La rama conserva los cambios anteriores de LEX-6.1 y LEX-6.2, sin commit.

## Entrega y archivos

Hoy ofrece un enlace al selector ES/EN con el filtro elegido. El usuario
puede estudiar todos los mazos activos o un subconjunto del curso. La acción
crea una sesión real bajo RLS y lleva a una confirmación autorizada con fecha,
alcance guardado y disponibilidad actual. No simula tarjetas o repasos.

| Archivo | Cambio |
|---|---|
| `src/modules/study/domain/study-session.ts` | Entidad y estados de sesión, sin dependencia externa. |
| `src/modules/study/domain/study-scope.ts` y `.test.ts` | Selección estricta, UUID normalizados, máximo 100 y comparación como conjunto. |
| `src/modules/study/application/study-session.ts` y `.test.ts` | Puerto, preparación, creación idempotente y lectura de sesión con cola reconstruida. |
| `src/modules/study/infrastructure/supabase-study-session-repository.ts` | Lectura e insert con cliente normal, dueño explícito y RLS. |
| `src/composition/study.ts` | Puerto de sesiones y UUID de petición generado en el servidor. |
| `src/app/[locale]/(app)/app/study/page.tsx` | Selector del curso activo, disponibilidad previa y Suspense local. |
| `scope-form.tsx` y `.test.tsx` en esa carpeta | Todos/subconjunto, estado pendiente, conservación de intención, error y foco. |
| `actions.ts` y `.test.ts` en esa carpeta | Identidad, curso y reloj autoritativos; invalidación y navegación tras éxito. |
| `[sessionId]/page.tsx`, `error.tsx` en esa carpeta | Confirmación autorizada y error recuperable, sin renderer. |
| `src/app/[locale]/(app)/app/dashboard-view.tsx` y `.test.tsx` | Enlace principal activo cuando hay trabajo; conserva el alcance. |
| `src/modules/identity/application/protected-paths.test.ts` | Verifica que las rutas nuevas heredan la protección de `/app`. |
| `messages/es.json`, `messages/en.json` | Textos del selector, confirmación, disponibilidad y errores. |
| `tests/unit/study/today-supabase.integration.test.ts` | Tres pruebas reales adicionales: creación, carrera e aislamiento. |
| `tests/e2e/today.spec.ts` | Extiende el flujo real y añade protección de las rutas de sesión. |
| `docs/STUDY_OVERVIEW.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `STATUS.md` | Contrato operativo, límites, evidencia y siguiente acción. |

También se actualiza el roadmap local ignorado por Git.
**Migraciones: 0. Dependencias nuevas: 0. ADR nuevos o modificados: 0.**
El skill lean-build mantuvo la entrega en una única capa de comportamiento:
reutilización de cola diaria, alcance, controles y políticas existentes,
sin introducir otro motor de colas ni almacenamiento de tarjetas.

## Reglas demostradas

- Todos equivale a `{ deckIds: null }`; el subconjunto exige entre 1 y 100
  UUID únicos válidos. Se validan mazos activos del dueño y curso actuales.
  Vacío, ajeno, archivado o curso distinto no crean una sesión.
- Se recalcula `getDailyQueue` con el instante y zona del servidor. Conserva
  orden y cupos: pasos vencidos, Review permitido y nuevos disponibles.
  El filtro no reinicia los límites; una cola vacía no se inserta.
- Se persiste únicamente ID, dueño, curso, alcance, estado `active` y fecha
  autoritativa. La base mantiene contadores cero y fin nulo. Ningún estado
  de memoria o log cambia por crear, repetir o consultar una sesión.
- La clave de petición es un UUID generado al cargar el formulario, estable
  durante sus reintentos. La PK existente resuelve carreras. El perdedor
  relee con su propio cliente: misma intención devuelve la fila original;
  cambiar curso o conjunto de mazos con el mismo ID da conflicto. No hay
  reparación automática, reactivación ni reinicio de fecha.
- La Server Action ignora campos de dueño, curso y fecha enviados desde el
  navegador. La creación está ligada a identidad verificada y curso activo;
  la lectura usa el curso guardado, no un curso enviado por el cliente.
- Las rutas están dentro de `/app`; anónimo recibe redirección con destino
  conservado y respuesta no cacheable. B no puede leer una sesión de A ni
  insertarla para A; anon tampoco puede leerla. La URL ajena devuelve 404.
- La disponibilidad se reconstruye en cada apertura desde el alcance
  guardado. No se almacena toda la cola. Las lecturas y el insert no son una
  reserva transaccional: la disponibilidad puede variar por otra revisión.

## Regresiones detectadas durante la implementación

1. React reseteaba los radios del formulario después de una acción fallida.
   Un segundo intento podía enviar «todos» pese a conservar las casillas.
   La prueba repetida lo detectó; un listener nativo de `reset` mantiene
   selección y clave de petición durante el commit. Regresión en los seis
   tests del formulario y en el navegador real, con foco en el grupo inválido.
2. Un `loading.tsx` de la ruta padre enviaba la respuesta antes de autorizar
   la sesión ajena, provocando un 200 con contenido not-found. La aserción
   HTTP del E2E lo detectó. Se eliminó ese prototipo y se limitó Suspense al
   selector; el detalle autoriza antes de renderizar y devuelve 404 real.
3. El gate de formato inicial detectó dos tests sin formatear. Se corrigieron
   con Prettier y se repitió el gate completo, no solo el paso fallido.

## Verificación local

Toolchain existente: Node `24.19.0` y pnpm `11.24.0`; no se actualizaron paquetes.

```text
LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18, build
  Test Files: 69 passed | 1 skipped (70)
  Tests: 467 passed | 1 skipped (468)

pnpm db:test
  Files=17, Tests=477, Result: PASS, exit 0

pnpm e2e tests/e2e/today.spec.ts --workers=2
  6 passed, exit 0

pnpm e2e --workers=2
  106 passed | 4 skipped (casos privados existentes), exit 0
```

La integración local está incluida en el gate: ocho tests totales en el
fichero, tres nuevos. Clientes autenticados normales y anon, contenido
sintético, sin `service_role`. Comprueba una sola fila ante dos envíos
simultáneos, snapshot exacto, reloj original en replay y memoria/logs intactos.
Solo admite el stack local; no se ejecutó contra Supabase alojado.

El E2E recorre Hoy filtrado → selector preseleccionado → subconjunto vacío
rechazado sin fila → creación válida → recarga sin duplicar. Inyecta campos
falsificados en el formulario y confirma dueño/curso/fecha reales. En inglés
crea otra sesión con todos los mazos. B recibe 404 en la URL guardada de A.

Se inspeccionaron visualmente las capturas `study-scope-en.png` y
`study-session-es.png` con datos sintéticos en `test-results/` (ignorado), en
Poco F5 emulado y el selector en escritorio Chromium. El flujo de Hoy conserva
las comprobaciones de tema oscuro y texto al 200 %. La inspección física en
Poco F5 sigue pendiente de LEX-6.13; emulación no equivale a prueba física.

## Límites y entrega

La confirmación indica que las tarjetas estarán disponibles próximamente.
Renderer (LEX-6.4), revelado/valoraciones, commit desde UI y controles de
pausa/reanudación/cierre no se han iniciado. No se marca una sesión completada
por tener una cola vacía ni se reactivan sesiones inactivas.

El caso privado unitario y los cuatro E2E privados existentes requieren su
entorno específico; no se copiaron datasets privados. Q-005/Q-006 y la deuda
de revisión independiente siguen abiertas. No hay CI remota, commit, PR,
push, etiqueta ni despliegue. La siguiente tarea es LEX-6.4, sin comenzar.
