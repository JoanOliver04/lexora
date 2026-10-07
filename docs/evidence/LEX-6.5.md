# LEX-6.5 — Revelado y cuatro valoraciones

**Fecha:** 2026-10-06
**Rama / base:** `feat/lex-6-5-reveal-ratings` / `cc98478`
**Estado:** `HECHO` con evidencia local: gate general, pgTAP y E2E completo verdes.
Cambios de LEX-6.1…LEX-6.4 conservados, sin commit ni publicación.

## Entrega y archivos

El primer ítem pide intentar recordar antes de revelar. La respuesta se
consulta al pulsar el control, con autorización nueva en el servidor. Tras
éxito se muestran respuesta, soluciones cloze y ejemplo/explicación opcionales,
y se habilitan las cuatro valoraciones con descripciones visibles. La elección
es local y se anuncia explícitamente como no guardada; no hay avance.

| Archivo | Cambio |
|---|---|
| `src/modules/study/application/study-card.ts` y `.test.ts` | Contenido con contexto opcional, reveal de lectura del mismo primer pendiente y valores de rating del dominio. |
| `src/modules/study/infrastructure/supabase-study-card-repository.ts` | Lee ejemplo y explicación del concepto con los filtros y RLS existentes. |
| `src/app/[locale]/(app)/app/study/reveal-actions.ts` y `.test.ts` | Identidad/Clock/zona del servidor, errores recuperables y acción sin escrituras. |
| `study-card-view.tsx` y `.test.tsx` en esa carpeta | Instrucción, pending, reveal, foco, controles de rating y elección local no persistida. |
| `[sessionId]/page.tsx` en esa carpeta | Monta la vista interactiva con frente únicamente; key de sesión/ítem/frente para reiniciar al cambiar. |
| `messages/es.json`, `messages/en.json` | Instrucciones, descripciones de rating, mensajes de error y límites honestos. |
| `tests/unit/study/today-supabase.integration.test.ts` | Amplía la lectura real para revelar, denegar B/anon/no-primero y comprobar estados/logs intactos. |
| `tests/e2e/study-renderer.spec.ts` | Reveal de tres modos, teclado/foco, ratings, contexto literal, recarga, ítem desactivado y ES/EN. |
| `docs/ARCHITECTURE.md`, `STUDY_OVERVIEW.md`, `STATUS.md` | Flujo, límites y handoff. |

Se actualiza también el roadmap local, excluido de Git.
**Migraciones: 0. Dependencias nuevas: 0. ADR nuevos/modificados: 0.**
ADR-003 y ADR-006 conservados. Lean-build dirigió la reutilización de la cola,
renderer y valores del dominio, sin nueva persistencia ni calcular FSRS en React.

## Decisiones y pruebas de comportamiento

- No hay excepción para valorar antes de revelar. Los controles están dentro
  de un fieldset deshabilitado y sus callbacks también comprueban reveal válido.
  La UI pide recuperación activa; no intenta demostrar que el usuario recordó.
- Respuesta, soluciones, ejemplo y explicación no están en DOM ni HTML/RSC
  inicial. La pista es texto elegido por el dueño; no se infiere si contiene
  una respuesta. Reveal obtiene el contenido vigente, no contenido del cliente.
- La acción solo admite sesión/ítem como intención. Ignora dueño, curso,
  momento, rating y estado previo falsificados. Usa `getClaims` y el reloj
  del contexto; el curso y alcance provienen de la sesión autorizada.
- `revealStudySessionCard` reconstruye la cola y exige coincidencia con el
  primer ID disponible. Ni otro ítem de la misma cola ni un UUID ajeno pueden
  usarse como atajo. Una sesión inactiva, cupos cambiados o ítem desactivado
  no revelan otro contenido. Cliente normal con RLS, nunca privilegiado.
- Pending bloquea un segundo envío y rating. Error conserva prompt sin
  respuestas y ofrece retry o refresh; no se finge éxito. El log de error
  contiene contexto fijo y kind, no respuesta ni mensaje privado de la base.
- Tras éxito el foco pasa al heading de respuesta; tras error al bloque de
  recuperación. Cloze conserva la lista ordenada; todos los campos son texto
  escapado de React. No se interpreta HTML ni se ejecutan scripts.
- Las cuatro descripciones están visibles y vinculadas a cada botón mediante
  `aria-describedby`. La selección usa `aria-pressed`, cambia solo React y
  anuncia «no guardada». Elegir otro rating cambia la selección, no la tarjeta.
  Recargar restaura frente oculto y controles bloqueados; no hay auto-reveal.
- Reveal y ratings no crean `LearningState`, logs, contadores o transiciones
  de sesión. No se llama al committer ni a `reviewPracticeItem`: ese cálculo
  necesita un estado y no corresponde fingir un guardado o introducir alta
  de memoria anticipada. LEX-5.8 sigue siendo la base de la escritura posterior.

## Verificación ejecutada

Toolchain existente: Node `24.19.0`, pnpm `11.24.0`.

```text
LEXORA_DB_TESTS=1 pnpm test [study-card, reveal-action, vista, integración]
  4 files passed / 46 tests passed, exit 0

pnpm e2e tests/e2e/study-renderer.spec.ts tests/e2e/today.spec.ts --workers=2
  8 passed, exit 0

pnpm e2e tests/e2e/study-renderer.spec.ts --project=escritorio-chromium --workers=1
  1 passed, exit 0 (checks de locale antes/después de reveal y rating)

LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18, build
  Test Files: 74 passed | 1 skipped (75)
  Tests: 522 passed | 1 skipped (523)

pnpm db:test
  Files=17, Tests=477, Result: PASS, exit 0

pnpm e2e --workers=2
  108 passed | 4 skipped (casos privados existentes), exit 0
```

La integración tiene diez tests totales, ampliados sin nueva fixture privada.
Clientes A/B/anon normales; reveal deja intactas filas de estado y logs. Solo
stack local permitido; no se ejecutó contra Supabase alojado. Los usuarios y
perfiles sintéticos permanecen como en las suites previas; cursos de prueba
se eliminan con alcance propio.

Fallos de preparación de pruebas corregidos sin desactivar checks:
`exact` pertenece a Playwright, no a `getByRole` de Testing Library; se retiró
de los tests unitarios. El selector global de alert capturaba también el
anunciador de rutas de Next; se acotó al card, conservando la aserción de error.
Se repitieron los gates afectados. Una sospecha visual de cambio de locale
se investigó con investigate-first: las aserciones antes/después pasaron y
no se reprodujo. No se aplicó un cambio de locale sin evidencia; se conservó
la cobertura dirigida.

## Inspección visual y pendientes manuales

Capturas `study-revealed-en.png` inspeccionadas en escritorio Chromium y Poco
F5 emulado; controles, descripciones, selección y contexto literal visibles.
Artefactos en `test-results/`, ignorado. La suite comprueba texto largo, tema
oscuro y 200 % sin overflow horizontal, así como reveal por teclado y foco.

Poco F5 físico y lector de pantalla físico pendientes; emulación no sustituye
esas comprobaciones. No se declara completada toda la accesibilidad de sesión
ni los atajos globales de LEX-6.12. La ergonomía física sigue en LEX-6.13.

## Límites, Git y siguiente acción

No hay preview de intervalos, guardado, avance ni ciclo de vida. La elección
local se pierde al recargar y la UI lo explica. No se promete progreso académico
o repaso confirmado. Un ítem editado entre lecturas se muestra con su contenido
vigente al revelar; las consultas no constituyen un snapshot transaccional.

Una unit privada y cuatro E2E privados existentes requieren su entorno; no se
copiaron datasets. Q-005/Q-006 y revisión independiente siguen abiertas. Sin
migraciones, lockfile, tipos generados o configuración FSRS cambiados.
Trabajo previo conservado en la rama, sin commit, CI remota, PR, push o despliegue.
Siguiente LEX-6.6, sin comenzar; no se inicia aquí.
