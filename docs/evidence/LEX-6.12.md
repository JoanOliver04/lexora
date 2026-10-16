# LEX-6.12 — Teclado y accesibilidad del estudio

**Fecha:** 2026-10-16

**Rama / base:** `feat/lex-6-12-study-accessibility` / `6c5c106`

**Estado:** `HECHO` local con evidencia automatizada y revisión independiente,
sin publicación. Validación manual con lector real y dispositivo físico pendiente.

## Entregado y decisiones

Espacio revela; 1–4 envían Otra vez/Difícil/Bien/Fácil por los mismos botones,
formularios y contrato de guardado existentes. La ayuda visible ES/EN aclara
que guardar requiere reveal y explica la navegación nativa. `aria-keyshortcuts`
declara cada combinación sin cambiar los nombres accesibles de los botones.

El hook escucha solo la tarjeta: fuera de ella no hay atajos de carácter. No
intercepta controles nativos, elementos editables o widgets de entrada; ignora
eventos ya cancelados, composición IME, repetición y modificadores. Comprueba
`:disabled`, también en fieldsets ancestros. No hay listeners globales de teclado, settings
nuevos, modo application, librería de hotkeys ni camino paralelo de escritura.
No se añade edición por atajo: no existe ese control en este flujo y queda fuera
de los criterios de esta entrega.

Los bloqueos existentes siguen activos: sin reveal/preview no se puede valorar;
pending, sesión cambiando u offline no generan otro intento. Un error incierto
solo permite reintentar el mismo rating/clave/revisión. Conflicto exige recarga.
El lock del formulario de reveal impide dos envíos síncronos; un error permite
reintentar explícitamente. Reconectar no envía valoraciones acumuladas.

El foco del frente describe prompt, instrucción y ayuda; el de respuesta describe
solo contenido ya autorizado. No hay respuesta en DOM, HTML/RSC inicial o árbol
accesible antes de revelar. No se añade una región live para toda la tarjeta;
el estado de guardado es breve, polite y atómico. Se conserva foco en respuesta,
nuevo frente, error de reveal/guardado y estado final sin tarjetas. Un error de
cambio de sesión enfoca recuperación; pausa/cierre enfocan el resumen.

Actualizar el resumen conserva foco con `aria-disabled` y una guarda de
activación mientras carga. Deshabilitar nativamente ese botón eliminaba el foco
en Chromium: las cuatro nuevas variantes E2E fallaron inicialmente ahí y pasaron
tras la corrección mínima, sin relajar la aserción.

Se reutilizan controles de 44 px, foco visible y la política global de movimiento
reducido. No se añade animación ni se altera el cálculo de memoria o la cola.

**Migraciones: 0. Dependencias: 0. ADR nuevos o modificados: 0.** ADR-001/004/006
se mantienen. Lean-build limitó el alcance a presentación y contratos existentes;
surgical-patch guió la corrección de foco reproducida; cavecrew aportó revisión
independiente antes y después del arreglo. Verify-and-stop acota el cierre a
criterios y regresiones, sin empezar otra tarea.

## Archivos afectados

- Nuevo `use-study-shortcuts.ts`: listener local con limpieza y activación nativa.
- `study-card-view.tsx` y sus tests: bindings, ayuda, descripciones, lock y anuncios.
- `session-controls.tsx`: foco del error de transición.
- `session-summary-view.tsx` y su test: foco de entrada y actualización sin perderlo.
- Mensajes ES/EN y nuevo `tests/e2e/study-keyboard.spec.ts`.
- Arquitectura, overview, estado, esta evidencia y roadmap privado.

## Evidencia ejecutada

```text
pnpm typecheck
  exit 0

Pruebas de tarjeta y resumen, antes de la regresión adicional
  2 files / 39 tests passed, exit 0

Pruebas de tarjeta y resumen, con regresiones finales
  2 files / 41 tests passed, exit 0

pnpm db:test
  18 files / 489 assertions, PASS, exit 0

CI=1 pnpm e2e tests/e2e/study-keyboard.spec.ts tests/e2e/study-renderer.spec.ts tests/e2e/study-lifecycle.spec.ts --workers=2 --retries=0
  primera ejecución: 4 passed / 4 failed por foco tras actualizar resumen
  tras corregir: 8 passed, exit 0, 47.5 s

LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18 y build
  88 files passed + 1 skipped / 738 tests passed + 1 skipped

CI=1 pnpm e2e --workers=2 --retries=0
  124 passed + 4 skipped (casos privados preexistentes), exit 0, 2.9 min

pnpm format:check (cierre documental) y git diff --check
  exit 0
```

Quince tests unitarios nuevos cubren cuatro ratings, repetición, IME, cuatro
modificadores, controles/editables, eventos cancelados, limpieza del listener,
offline, fieldset ancestro, doble envío y reintento de la misma intención. Se
amplían las aserciones de descripciones accesibles, error de sesión y resumen.

Las cuatro variantes nuevas de navegador recorren ES/EN en escritorio y Poco F5
emulado. Tras la preparación sintética, todo el recorrido de estudio usa teclado:
Tab real hasta crear, reveal por atajo, ausencia de respuesta en árbol accesible,
guardado retenido por transporte (una petición), nuevo frente sin respuesta,
pausa, refresco con foco conservado, reanudación, reveal con Espacio nativo,
casilla de intervalos sin captura de 3, Tab/Mayús+Tab por los ratings y guardado
con Intro. La base confirma exactamente Good/Easy; al agotar tarjetas recibe
foco el estado guardado, al completar lo recibe el resumen con dos repasos.
También verifica desconexión sin cola, contorno de foco, targets de al menos
44 × 44 px, etiqueta de casilla de 44 px y transición reducida menor de 1 ms.
No se salta el orden de tabulación enfocando controles por script.

Los fixtures usan material original y usuarios sintéticos del Supabase local,
con guardia localhost/puerto y cliente normal bajo RLS. La limpieza borra solo
su curso de prueba. No se ejecuta seed/reset ni se toca información real.
Las regresiones de renderer y ciclo de sesión también pasan.

Capturas inspeccionadas: frente ES en escritorio, respuesta EN en móvil emulado
y resumen con foco ES móvil/EN escritorio. Artefactos locales ignorados en
`test-results/`. Revisión independiente estática final sin hallazgos pendientes;
no se presenta como una ejecución de tests ni como una prueba de lector real.

## Validación manual pendiente y límites

No se ha escuchado NVDA, Narrador o TalkBack ni se ha probado teléfono físico.
El árbol accesible y las aserciones de foco prueban el contrato técnico, no la
experiencia de una combinación concreta de lector/navegador. No es certificación
WCAG completa. La aceptación manual debe comprobar: lectura del frente sin
respuesta; reveal y lectura de respuesta; navegación nativa por controles;
anuncio de guardado/error; siguiente frente; pausa y resumen; ausencia de ruido
o trampa de foco. La ergonomía física se mantiene en su gate, sin adelantarlo.

Sin migración, seed, reset, push, CI remota, despliegue o cambio de plan.
`main` y producción intactos; la guarda de sesión de LEX-6.10 sigue pendiente
allí. No cambia Q-005/Q-006/Q-008. LEX-6.13 no se inicia.
Diff completo revisado: trece archivos afectados; sin cambios en SQL, tipos
generados o lockfile. Los 85 enlaces Markdown relativos resuelven y no se
detectan patrones de credenciales. Roadmap privado, variables y artefactos
permanecen ignorados. Entrega conservada en un commit local de esta rama.

Fuentes: documentación de accesibilidad y `useRouter` de la versión Next.js
instalada; [atajos de carácter con ámbito de foco, W3C](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)
y [declaración de atajos en ARIA](https://www.w3.org/TR/wai-aria-1.3/#aria-keyshortcuts).
