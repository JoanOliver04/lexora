# LEX-6.1 — Read model de Hoy

**Fecha:** 2026-10-06
**Rama / base:** `feat/lex-6-1-today-read-model` / `cc98478`
**Estado resultante:** `HECHO` con evidencia local. Cambios sin commit;
CI configurada, todavía no ejecutada en remoto.

## Resultado y archivos

`getTodayOverview` reutiliza la carga de cola y devuelve recuentos disponibles,
vencidos totales, trabajo oculto por límites, difíciles y una estimación temporal.
La clasificación y la mediana son funciones puras. El adaptador lee la historia
con la sesión normal del usuario; la composición entrega el nuevo puerto.

| Archivo | Cambio |
|---|---|
| `src/modules/study/application/today-overview.ts` y `.test.ts` | Puerto, DTO y consulta de Hoy; límites, tiempo, errores y alcance. |
| `src/modules/study/application/daily-queue.ts` | Extrae `loadDailyQueue` para compartir candidatos y cola; conserva el contrato de `getDailyQueue`. |
| `src/modules/study/domain/difficult-item.ts` y `.test.ts` | Clasificación por lapsos o últimos intentos. |
| `src/modules/study/domain/study-time-estimate.ts` y `.test.ts` | Mediana, muestras válidas y respaldo. |
| `src/modules/study/infrastructure/read-study-rows.ts` y `.test.ts` | Paginación, filtros de IDs acotados y error de una página posterior. |
| `src/modules/study/infrastructure/supabase-today-overview-repository.ts` | Historia de valoraciones y duración reciente, filtradas por dueño. |
| `src/modules/study/infrastructure/supabase-daily-queue-repository.ts` | Lecturas completas paginadas y exclusión de enlaces entre cursos. |
| `src/composition/study.ts` | Entrega el puerto `todayOverview` con la identidad verificada. |
| `tests/unit/study/today-supabase.integration.test.ts` | PostgREST real, más de 1.000 filas y aislamiento A/B/anon. |
| `.github/workflows/ci.yml` | Activa la integración local en el trabajo de base de datos. |
| `docs/STUDY_OVERVIEW.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md` | Semántica, límites operativos, evidencia y siguiente acción. |

El roadmap local también se actualiza; sigue excluido de Git.
**Migraciones: 0. Dependencias nuevas: 0. ADR nuevos o modificados: 0.**
No se han cambiado pesos FSRS, esquema, RLS, logs ni interfaz.

## Comandos ejecutados y salida real

La terminal inicial resolvía Node 22 y no encontraba pnpm. Se antepuso al PATH
del proceso la instalación existente de nvm `v24.19.0`, sin reinstalar paquetes.

```text
node --version   v24.19.0
pnpm --version   11.24.0

pnpm check (antes del cambio)
  exit 0; 56 ficheros passed + 1 skipped / 371 tests passed + 1 skipped; build correcto

pnpm test [difíciles, estimación, Hoy, cola diaria]
  Test Files  4 passed (4)
       Tests  26 passed (26)

LEXORA_DB_TESTS=1 pnpm test tests/unit/study/today-supabase.integration.test.ts
  Test Files  1 passed (1)
       Tests  4 passed (4)

pnpm db:test
  All tests successful.
  Files=17, Tests=477
  Result: PASS

LEXORA_DB_TESTS=1 pnpm check (final)
  formato, lint y typecheck: exit 0
  contraste: 18/18
  Test Files  61 passed | 1 skipped (62)
       Tests  397 passed | 1 skipped (398)
  build: Compiled successfully; páginas generadas 24/24; exit 0
```

El salto existente corresponde al dataset privado de importación, no disponible
en esta ejecución. La integración de esta tarea **sí se ejecutó**, tanto aislada
como dentro del gate final. Un primer fixture falló por campos opcionales mixtos
en un INSERT por lotes; se fijaron valores explícitos. También se corrigió un tipo
opcional de ese fixture y se aplicó el formato antes del gate final.

## Resultados de pruebas y decisiones

- Disponibilidad y backlog coinciden con la cola; los pasos futuros no se cuentan
  como disponibles y los dos modos de un concepto consumen dos huecos nuevos.
- Los difíciles se cuentan en todo el alcance elegible, con independencia del
  vencimiento o límite. `hard` no se interpreta como `again`.
- La estimación usa hasta 100 duraciones positivas de los últimos 30 días, con
  un mínimo de cinco y respaldo de 30 segundos. Es una pasada por la cola,
  sin trabajo oculto ni predicción de repeticiones futuras. Documentado en
  `STUDY_OVERVIEW.md`; el DTO distingue historia de respaldo.
- Los límites diarios usan el día IANA del perfil; probados medianoche y días
  de 23/25 horas en Europe/Madrid.
- La integración lee **1.101 conceptos, ítems y estados**, sin truncarlos, y
  clasifica 1.101 difíciles por lapsos.
- Lee **1.005 repasos del día** y encuentra las tres últimas valoraciones de
  un ítem antiguo detrás de más de 1.000 registros recientes de otro ítem.
- Conceptos compartidos no duplican candidatos. Se excluyen entidades archivadas, ítems
  deshabilitados, conceptos sin mazo y enlaces entre cursos.
- Un dueño puede leer sus señales; otra sesión y anon no las leen ni con los
  identificadores conocidos. No se usa `service_role`.
- Una página fallida propaga error, sin entregar un éxito parcial.

Gates 12.1/12.2: check final y revisión de capas/diff. Gates 12.3/12.6:
pgTAP e integración real con RLS; sin cambio de esquema ni permisos. Gate 12.4:
reloj explícito, pruebas IANA y suite existente de FSRS/commit intacta. Gate
12.9: paginación e IDs acotados, prueba real por encima del límite de PostgREST.
Los gates de UI, importación, PWA y despliegue no se activan con esta consulta.

## Comprobaciones manuales y límites

No hay una nueva superficie visual que comprobar manualmente. No se ejecutó
Playwright en local; el flujo visual se construirá en la siguiente tarea.
La CI y cualquier publicación están pendientes; no se declara un resultado remoto.

Las cifras se obtienen mediante varias lecturas, sin snapshot transaccional.
Una revisión concurrente puede hacer que cambien durante la carga; la escritura
sigue protegida por revisión optimista. Las tres últimas valoraciones pueden
exigir recorrer historia antigua. No se añade materialización sin evidencia de
necesidad. La integración limpia solo sus cursos sintéticos; quedan usuarios
de Auth y perfiles de prueba, igual que en los E2E de registro.

Q-005/Q-006 y la deuda de revisión independiente de M5 siguen abiertas.
El skill lean-build mantuvo el alcance en la consulta, reutilizando la cola y
el esquema existentes. No se ha comenzado LEX-6.2.

## Estado Git y siguiente acción

Rama `feat/lex-6-1-today-read-model`, base y HEAD `cc98478`; cambios locales
sin commit. Sin lockfile, SQL ni tipos generados modificados. Sin PR, push ni
despliegue. Siguiente tarea: **LEX-6.2 — dashboard Hoy**.
