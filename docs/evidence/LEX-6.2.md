# LEX-6.2 — Dashboard Hoy

**Fecha:** 2026-10-06
**Rama / base:** `feat/lex-6-2-today-dashboard` / `cc98478`
**Estado resultante:** `HECHO` con evidencia local: gate general, pgTAP y E2E completo verdes.
La rama conserva los cambios locales terminados de LEX-6.1. Sin commit ni CI remota.

## Entrega y archivos

La home autenticada ES/EN sustituye el marcador de posición por Hoy: disponibilidad,
repasos vencidos totales, pasos de aprendizaje, nuevos, difíciles, estimación y
trabajo oculto por límites. Incluye actividad diaria y de siete días locales y
acceso al último filtro de sesión del curso activo.

| Archivo | Cambio |
|---|---|
| `src/app/[locale]/(app)/app/page.tsx` | Home Hoy, curso activo, carga con Suspense y navegación existente. |
| `dashboard-content.tsx` y `.test.tsx` en esa carpeta | Lectura desde composición; identidad y reloj del servidor, error recuperable sin detalles privados. |
| `dashboard-view.tsx` y `.test.tsx` en esa carpeta | Vista semántica, estados disponible/vacío/límite/espera, cifras y actividad. |
| `dashboard-error.tsx`, `error.tsx` en esa carpeta | Reintento de lectura y frontera de error con `retry` de la versión instalada de Next.js. |
| `src/modules/study/application/today-dashboard.ts` y `.test.ts` | Coordina read model, validación del alcance, estado de disponibilidad y resumen. |
| `src/modules/study/domain/study-activity.ts` y `.test.ts` | Ventana de siete días IANA y recuentos por log/ítem/duración. |
| `src/modules/study/domain/study-scope.ts` y `.test.ts` | Snapshots de alcance y parámetros de URL validados y normalizados. |
| `src/modules/study/infrastructure/supabase-today-dashboard-repository.ts` | Lecturas paginadas de actividad, mazos y última sesión; sesión normal y RLS. |
| `src/composition/study.ts` | Añade el puerto de dashboard al contexto autenticado. |
| `messages/es.json`, `messages/en.json` | Namespace Today completo y eliminación del marcador de posición. |
| `tests/unit/study/today-supabase.integration.test.ts` | Añade prueba real de actividad y último filtro, con aislamiento de curso y dueño. |
| `tests/e2e/today.spec.ts` | Dashboard real, restauración y recuperación del filtro, ES/EN, escritorio/móvil, tema y texto ampliado. |
| `docs/STUDY_OVERVIEW.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md` | Fórmulas, alcance, límites, estado y siguiente acción. |

También se actualiza el roadmap local, que sigue excluido de Git.
**Migraciones: 0. Dependencias nuevas: 0. ADR nuevos o modificados: 0.**
Se reutilizan la cola, RLS, tablas, tokens, controles e internacionalización
existentes; el skill lean-build mantuvo la separación entre lectura y creación de sesiones.

## Decisiones de implementación

- El estado se deriva en aplicación. Un error nunca se representa como una cola
  vacía ni como actividad cero. La vista distingue cuota agotada, ítems futuros
  y ausencia de ítems, y señala los repasos aún vencidos que un límite oculta.
- La actividad suma todo el curso y lo indica en el texto. El filtro afecta las
  cifras pendientes, no el historial breve. Los siete días incluyen hoy y
  recorren medianoches IANA; DST produce semanas de 167 o 169 horas.
- Cada log cuenta un intento. Nuevas practicadas son ítems distintos con fase
  previa `new` por día. El tiempo es solo duración registrada, con aviso si
  faltan muestras. No se muestra un porcentaje de nivel académico.
- El último alcance se lee de `study_sessions.scope` del dueño/curso, sin crear
  una sesión. El enlace valida mazos activos. Un UUID ajeno, archivado o malformado
  se recupera con «todos los mazos», sin mostrar información privada.
- La acción principal **Empezar sesión** está deshabilitada y tiene una descripción
  accesible de disponibilidad. La creación de sesiones se implementa en LEX-6.3;
  esta tarea no abre una ruta ficticia ni simula que se puede estudiar.
- Las lecturas no se cachean entre usuarios. La identidad y el único instante
  de cálculo proceden de la composición del servidor. Fechas inglesas `en-GB`.

## Comandos ejecutados y salida real

Toolchain existente: Node `24.19.0`, pnpm `11.24.0`, antepuestos al PATH del proceso.
No se reinstalaron paquetes ni se cambiaron versiones.

```text
pnpm typecheck
  exit 0

LEXORA_DB_TESTS=1 pnpm test [actividad, alcance, dashboard, integración]
  Test Files  4 passed (4)
       Tests  24 passed (24)

pnpm test [dashboard-view.test.tsx]
  Test Files  1 passed (1)
       Tests  9 passed (9)

pnpm e2e tests/e2e/today.spec.ts tests/e2e/onboarding.spec.ts tests/e2e/protected.spec.ts --workers=2
  18 passed (33.0s)

pnpm db:test
  All tests successful.
  Files=17, Tests=477
  Result: PASS

LEXORA_DB_TESTS=1 pnpm check (final)
  formato, lint, typecheck, contraste 18/18: exit 0
  Test Files  66 passed | 1 skipped (67)
       Tests  429 passed | 1 skipped (430)
  build: Compiled successfully; páginas generadas 24/24; exit 0

pnpm e2e --workers=2
  4 skipped
  104 passed (1.9m)
  exit 0
```

El salto unitario sigue siendo el test de datos privados de importación, no
disponibles. Los cuatro saltos E2E son los casos existentes de importación privada,
en los dos proyectos de navegador. La integración de Hoy se ejecutó dentro del gate final: cinco
tests, incluyendo actividad a través de PostgREST y más de 1.000 filas.
Se corrigieron el tipado del fixture de Auth, el JSX dentro del try de lectura
y el formato detectados por los gates. El test de navegación unitario usa un
doble en la frontera de Next.js por su resolución ESM; las URL y los enlaces
reales se prueban en Playwright.

## Pruebas y revisión visual

- Actividad y alcance: medianoche, DST, logs repetidos, nuevos distintos, tiempo
  ausente/medido y exclusión de intentos futuros.
- Aplicación: separación de curso/filtro, selección inválida, último alcance
  no disponible, estados de cola y errores propagados.
- Presentación: cifras/ocultos, mediana aproximada, espera con zona del perfil,
  vacío, límite, idioma, reintento y `retry` de la frontera de error.
- Contenido de servidor: sesión caducada redirige; fallo de infraestructura
  recuperable no expone su mensaje; un fallo inesperado llega a la frontera.
- Integración: dueño lee 1.005 registros del curso; otro curso y otra sesión no
  los reciben; último filtro no mezcla cursos ni permite datos del otro dueño.
- E2E: contenido sintético, pendientes reales, resumen de tres logs, filtro
  que cambia la cola pero conserva el resumen, navegación con teclado y ES/EN.
- Inspección de capturas: escritorio y Poco F5 emulado en claro, móvil en oscuro.
  Texto ampliado al 200 % sin overflow horizontal, probado en ambos proyectos.

Gates 12.1/12.2: check y revisión del cambio por capas. Gates 12.3/12.6:
pgTAP e integración con RLS; sin esquema ni permisos nuevos. Gate 12.4:
reloj del servidor y pruebas temporales. Gate 12.7: ES/EN, semántica, teclado,
contraste de tokens, layouts, tema y texto ampliado. Gate 12.9: lecturas paginadas,
sin consultas por cada log ni caché de datos privados. Importación, PWA y
despliegue no se cambian en esta tarea.

## Comprobaciones manuales y límites

Queda para el propietario la ergonomía en su Poco F5 físico en la tarea
específica de dispositivo. Aquí se verificó el viewport emulado de 393×873 y
Chromium de escritorio. No se declara una comprobación física.

El botón de inicio espera a LEX-6.3. Las lecturas no son un snapshot
transaccional y pueden variar durante un repaso concurrente, como en LEX-6.1.
Las pruebas limpian solo los cursos sintéticos que crean; quedan usuarios de
Auth y perfiles de prueba. Q-005/Q-006 y la revisión independiente de M5
siguen abiertas. CI remota y publicación siguen pendientes.

## Estado Git y siguiente acción

Rama `feat/lex-6-2-today-dashboard`, base y HEAD `cc98478`, con cambios locales
de LEX-6.1 y LEX-6.2 sin commit. Sin SQL, lockfile ni tipos generados modificados.
Sin push, PR ni despliegue. Siguiente tarea: **LEX-6.3**, no empezada.
