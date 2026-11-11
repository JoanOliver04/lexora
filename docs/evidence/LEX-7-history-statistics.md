# Historial, estadísticas y actualización de seguridad

Fecha: 2026-11-11. Rama local `feat/v1-history-and-progress`, base `98732f8`.
Continuación de la V1 autorizada por Joan; trabajo sin commit, push ni despliegue.

## Entregable

- Historial privado ES/EN con 40 eventos por página, cursor estable, filtros,
  fechas del perfil y timeline de concepto o tarjeta.
- Estadísticas de 7/30/90 días, mazo, ratings, recuerdo observado, duraciones con
  cobertura, memoria actual, lapsos, difíciles y previsión de siete días.
- Dos migraciones locales aditivas: índices de historial y RPC de lectura
  `study_statistics`, con RLS y `SECURITY INVOKER`; tipos regenerados.
- Medidores HTML accesibles sin librería nueva de gráficos. ADR-007 y
  [definiciones de métricas](../STATISTICS.md).
- Next.js 16.4.6, Zod 4.6.7, ESLint config de Next correspondiente y Vitest
  4.1.12; overrides acotados de dependencias de desarrollo vulnerables.

## Seguridad de dependencias

La auditoría inicial de producción notificó 15 avisos: tres críticos, seis
altos, cinco moderados y uno bajo. No se afirma que se haya explotado ninguno
ni que todos fueran alcanzables por las rutas de Lexora. Sí afectaban a las
versiones instaladas y justificaban la actualización.

Referencias verificadas:
[Next.js, Image Optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
[Next.js, use cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr),
[Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

Después de corregir producción y herramientas de desarrollo, `pnpm audit --json`
devuelve cero avisos en todas las severidades. Es una consulta del registro en
esta fecha, no una garantía absoluta ni una actualización de producción.

Se mantienen las restricciones de scripts de instalación. Los overrides
conservan sus versiones mayores salvo `minimatch` de `typescript-estree`, que
usa la API con exports nombrados conservada en v11. Se valida con lint, pruebas
de arquitectura y la suite. No se añade una dependencia de interfaz.

## Evidencia ejecutada

- Migraciones aplicadas solo con `supabase migration up --local`.
- `pnpm db:test`: 19 archivos, 497 aserciones, PASS.
- `pnpm db:test:catalogue`: 17 migraciones reales desde cero, 15 aserciones,
  PASS; base desechable eliminada, sin semillas ni reset del stack normal.
- Pruebas de integración con 1.044 eventos, RLS A/B/anon, paginación con
  microsegundos, filtros combinados, contenido archivado y lecturas sin
  mutaciones. El historial archivado permanece y la memoria actual lo excluye.
- E2E nuevo dirigido: seis pruebas PASS en ES/EN, Chromium escritorio y móvil
  emulado. Recorre alta/onboarding, repaso guardado por UI, historial, filtros,
  timeline, estadísticas y periodo 90 días.
- Matriz visual dirigida: ancho normal/320 px, texto 100/200 %, claro/oscuro,
  overflow, solapamiento de etiquetas y cifras y targets de enlaces/botones.
  Capturas inspeccionadas. Detectó y corrigió el título inglés sin ajuste de
  palabra a 320 px/texto 200 %; se mantiene la aserción.

`LEXORA_DB_TESTS=1 pnpm check`: exit 0; formato, lint, tipos, contraste,
761 tests PASS + 1 omitido, build Next.js 16.4.6. Se revisó el lockfile como
texto (Git lo marca `-diff` en este repositorio). La prueba EXPLAIN con 1.044
eventos confirma lectura mediante índice de propietario/fecha; PostgreSQL puede
elegir el índice temporal previo con ordenación incremental o el índice nuevo.
No se fuerza un nombre de índice ni se extrapolan tiempos a producción.

Una pasada simultánea de tests y build agotó el timeout de arranque de ESLint
en la prueba de arquitectura; la pasada secuencial completa pasa sin subir
timeouts ni omitir la aserción. E2E completo final con `CI=1`, dos workers y
`--retries=0`: 130 PASS + 4 omitidas, exit 0 (134 casos; seis nuevos). Incluye
el error/reintento con mazo inaccesible; los mensajes 42501 de ese caso son
esperados. No se ocultó ni deshabilitó ninguna prueba.

`pnpm install --frozen-lockfile --ignore-scripts`: exit 0, lockfile consistente.
Auditoría final completa, después de fijar Vite 8.2.4: cero avisos de cualquier
severidad. No se dejó la excepción temporal de antigüedad para Vite 8.3.8.
El recuento de roadmap usa IDs únicos: LEX-3.13 tiene una mención duplicada
histórica y no se cuenta dos veces. F7 queda en 4/10 local, sin cerrar la fase.

## Límites y siguiente trabajo

Build optimizado dejado en `http://localhost:3000`, limitado a loopback.
Última comprobación: `/api/health` HTTP 200, `app: true`, `database: true`.
Rutas nuevas: `/es/app/history`, `/es/app/statistics` y sus variantes `/en`.

## Archivos y decisiones

Las pantallas nuevas están en `src/app/[locale]/(app)/app/history/` y
`statistics/`, con página, carga y error. Navegación añadida en Hoy y en el
detalle de concepto. Composición nueva en `src/composition/history.ts`.
Lógica y puertos en `review-history.ts`, `statistics.ts` y sus tests; adaptadores
Supabase separados. Se amplía `study-day.ts` con conversión estricta de fecha
civil y `globals.css` con el estilo accesible de medidores.

Mensajes ES/EN, tipos Supabase generados, `package.json`, lockfile y overrides
actualizados. Pruebas nuevas en `tests/unit/study/history-supabase.integration.test.ts`,
`tests/e2e/history-statistics.spec.ts` y pgTAP `180-history-statistics.sql`.
Documentación: README, STATUS, STATISTICS, índice de ADR y ADR-007, este informe
y los dos documentos privados coordinados. No se modifican las decisiones de
ADR-001…006.

Migraciones: `20261111123657_review_history_indexes.sql` y
`20261111124246_study_statistics.sql`, aplicadas solo al entorno local.

## Trabajo pendiente

No se cierra la fase 7: faltan desgloses por categoría/nivel y completar su
auditoría. Ajustes, exportación, borrado, PWA y preparación pública continúan
pendientes. La confirmación general de Joan de uso satisfactorio en móvil y
ordenador no acredita zoom nativo, lector real, versión servida ni los casos
concretos todavía abiertos de Q-009. No se declara una V1 terminada.

Se conservaron las modificaciones previas de `OPEN_QUESTIONS.md`, `STATUS.md` y
`LEX-6.13.md`; solo se añade un checkpoint a STATUS. No se usa material privado
como fixture. Las cuentas de prueba son sintéticas; los cursos de las pruebas
se limpian y no se borran datos reales. Sin revisión por otro agente ni CI remota.
