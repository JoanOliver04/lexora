# LEX-6.4 — Renderer de contenido V1

**Fecha:** 2026-10-06
**Rama / base:** `feat/lex-6-4-practice-renderer` / `cc98478`
**Estado:** `HECHO` con evidencia local: gate general, pgTAP y E2E completo verdes.
Conserva los cambios locales de LEX-6.1…LEX-6.3, sin commit ni publicación.

## Entrega y archivos

Reconocimiento, recuperación y cloze estructurado comparten el renderer de
prompt/pista y respuesta/soluciones. La biblioteca conserva su preview nativo;
la sesión muestra el primer frente elegible del alcance guardado. No revela
la respuesta ni ofrece valoraciones o avance. Texto ES/EN, controles y tokens
existentes. Contenido propio o importado permanece literal.

| Archivo | Cambio |
|---|---|
| `src/modules/library/application/practice-item-content.ts` y `.test.ts` | DTO de contenido V1, validación reutilizada y proyección explícita sin soluciones. |
| `src/modules/library/presentation/practice-item-content.tsx` y `.test.tsx` | Renderer sin estado: prompt/pista y respuesta con lista ordenada de cloze. |
| `src/modules/study/application/study-card.ts` y `.test.ts` | Puerto de contenido y consulta del primer frente después de autorizar sesión y reconstruir cola. |
| `src/modules/study/infrastructure/supabase-study-card-repository.ts` | Lectura RLS de dueño/curso, ítem y concepto activos; valida config persistida. |
| `src/modules/study/infrastructure/supabase-daily-queue-repository.ts` | Filtra modos V1 también al construir candidatos. |
| `src/composition/study.ts` | Añade el puerto `cards` al contexto autenticado. |
| `src/app/[locale]/(app)/app/study/[sessionId]/page.tsx` | Renderiza solo el frente; recupera desaparición entre lecturas con recarga. |
| `src/app/[locale]/(app)/concepts/[conceptId]/items/[itemId]/practice-item-preview.tsx` | Reutiliza renderer, mantiene details y evita preview funcional de modos reservados. |
| `messages/es.json`, `messages/en.json` | Etiquetas y avisos honestos sobre el alcance disponible. |
| `tests/unit/study/today-supabase.integration.test.ts` | Dos tests adicionales de contenido, aislamiento, validación y ausencia de escrituras. |
| `tests/e2e/study-renderer.spec.ts` | Tres modos reales, contenido adverso, payload sin soluciones, preview y texto ampliado. |
| `tests/e2e/today.spec.ts` | Frente visible y respuesta ausente tras crear la sesión filtrada. |
| `docs/ARCHITECTURE.md`, `STUDY_OVERVIEW.md`, `STATUS.md` | Contrato, límites y estado operativo. |

Roadmap local actualizado y excluido de Git.
**Migraciones: 0. Dependencias nuevas: 0. ADR nuevos/modificados: 0.**
ADR-001 y ADR-003 conservados. El skill lean-build dirigió la reutilización
del preview y la cola, con partes de renderer componibles, sin registro de
plugins, motor de ejercicios adicional ni anticipar el flujo de valoraciones.

## Decisiones y límites demostrados

- Prompt, pista, respuesta y soluciones son nodos de texto de React: no se
  interpretan como HTML ni se ejecutan scripts, imágenes o URL. Mantienen
  saltos de línea y ajuste de palabras largas. Dirección igual a la guardada.
- Cloze conserva el enunciado tal cual y las soluciones en orden, incluidas
  repeticiones. Se reutiliza la validación existente; no se inventa una
  convención de hueco ni se transforma `___`, `[gap]` u otros marcadores.
- No se amplía el parser/importador: el renderer admite cloze ya estructurado
  con `config.answers`. No convierte un frente de importación básica en cloze
  ni infiere sus respuestas. Ese límite previo sigue intacto.
- La sesión se autoriza por dueño antes de consultar contenido. La consulta
  usa el curso guardado, el primer ID de la cola vigente y el cliente normal.
  Revalida ítem activo/habilitado, concepto activo, curso y modo. A/B/anon no
  comparten contenido ni por UUID conocido o dueño falsificado en el adaptador.
- `practiceItemPromptFrom` devuelve solo modo, prompt y pista. No envía
  respuesta, lista de soluciones, config ni metadata al renderer de sesión.
  No basta esconder un DOM: el E2E comprueba también HTML/RSC inicial sin
  los sentinels de respuesta y soluciones.
- La pista es autoría del usuario y se muestra como tal; no se promete
  detectar si el texto de una pista o un prompt contiene la respuesta.
- Solo los tres modos V1 entran en candidatos. Las cuatro variantes futuras
  se prueban con filas habilitadas a propósito: no aparecen en la cola,
  no consumen cupo y el repositorio de contenido tampoco las devuelve.
- Sesión ausente/ajena: 404 antes de streaming, comportamiento conservado.
  Sesión inactiva o cola vacía: sin frente y sin reactivación. Si el primer
  ítem desaparece entre lecturas, se informa y ofrece recarga; no se
  sustituye silenciosamente. Error de lectura/config: frontera de error
  existente, nunca éxito con un falso cero.
- Consultar o previsualizar no escribe memoria, logs o contadores de sesión.
  La biblioteca mantiene su reveal de lectura con `<details>`; no es una
  valoración ni un repaso. La sesión todavía no revela ni avanza.

## Comandos ejecutados y resultados

Toolchain existente: Node `24.19.0`, pnpm `11.24.0`. No se actualizaron paquetes.

```text
LEXORA_DB_TESTS=1 pnpm test [contenido, renderer, sesión, integración]
  4 files passed / 36 tests passed, exit 0

pnpm e2e tests/e2e/study-renderer.spec.ts tests/e2e/today.spec.ts tests/e2e/practice-items.spec.ts --workers=2
  14 passed, exit 0

LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18, build
  Test Files: 72 passed | 1 skipped (73)
  Tests: 495 passed | 1 skipped (496)

pnpm db:test
  Files=17, Tests=477, Result: PASS, exit 0

pnpm e2e --workers=2
  108 passed | 4 skipped (casos privados existentes), exit 0
```

El fichero de integración tiene diez tests totales, dos nuevos: lectura
autorizada sin escrituras y validación de recall/cloze/filas no elegibles.
Incluye los clientes A/B/anon normales, sin `service_role`, y rechaza destinos
fuera del stack local. Las fixtures son sintéticas. Los cursos de esa
ejecución se limpian; perfiles/usuarios de Auth de prueba permanecen, patrón
ya establecido. No se ejecutó contra Supabase alojado.

Regresiones de preparación detectadas y corregidas, sin desactivar checks:
el test de renderer necesitaba el entorno jsdom explícito de la casa;
PostgREST exige columnas coherentes en el insert mixto de fixtures (se
explicitó `enabled`/`archived_at`); el helper genérico de query no admitía la
unión de error de Auth (se verifica el resultado de Auth directamente).
Se repitieron las pruebas afectadas y el gate general completo.

Durante el E2E completo apareció un error de preparación de Auth local
`PGRST303: JWT issued at future`; el helper de alta existente reintentó y el
caso pasó. No se modificó Auth ni se añadió un retry global. Queda registrado
como incidencia del entorno, no como un fallo del renderer ni como deuda cerrada.

## Verificación visual y manual pendiente

Inspeccionadas las capturas de escritorio ES y móvil emulado EN oscuro a
200 % (`study-recognition-es.png`, `study-cloze-en-dark-zoom.png`), generadas
en `test-results/` e ignoradas por Git. Texto adverso visible como literal;
contenido con saltos, palabra larga y texto ampliado sin overflow horizontal.
La prueba de navegador recorre los tres modos en escritorio Chromium y
Poco F5 emulado; el preview cloze abre con teclado y conserva orden/escape.

La comprobación física del Poco F5 sigue pendiente de LEX-6.13. Emulación
no equivale a prueba física. No se declara lector de pantalla físico probado
ni completado el gate global de accesibilidad de la sesión.

## Entrega y siguiente acción

Una unit privada y cuatro E2E privados existentes requieren su entorno;
no se copiaron datasets privados. Q-005/Q-006 y revisión independiente siguen
abiertas. El árbol incluye las tareas previas sin commit. Sin cambios en
lockfile, tipos generados, SQL, scheduler o FSRS. Sin CI remota, PR, push,
etiqueta ni despliegue.

Siguiente: LEX-6.5, sin comenzar. No se añaden reveal en estudio, valoraciones,
preview de intervalos, persistencia de repasos, avance o ciclo de vida.
