# LEX-3.11 — Crear previsualización de ítems

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-11-item-preview`
**Estado resultante:** `HECHO`. PR #43 fusionada a `main` (merge `230924f`);
CI verde en los tres trabajos, runs `33896380937` (PR) y `33896772890`
(merge).

---

## 1. Alcance

Un ítem de práctica (`PracticeItem`) se crea y edita a ciegas desde LEX-3.7:
el formulario no muestra cómo se vería al estudiar. Esta tarea añade esa
vista — **sin** planificador ni valoración, eso es FASE 5/6. Es una vista de
lectura pura sobre el `PracticeItem` ya guardado.

**Entregado:**

- `PracticeItemPreview` (nuevo, `concepts/[conceptId]/items/[itemId]/`):
  enunciado siempre visible, pista si existe, respuesta oculta tras un
  `<details>`/`<summary>` nativo («Ver respuesta», sin JavaScript de
  cliente). Para `cloze`, además de la respuesta completa, lista las
  soluciones del hueco (`config.answers`) en orden, con su propia etiqueta.
- Montada en el detalle de ítem (`items/[itemId]/page.tsx`), antes del
  formulario de edición: se ve cómo quedaría, luego se edita si hace falta.
  Visible también en un ítem archivado, coherente con el patrón ya
  establecido (LEX-3.7/3.8: archivar cambia visibilidad en listas, no
  impide ver el detalle por URL directa).

**Fuera de alcance, declarado:**

- **Ningún marcador de hueco en `promptText`.** LEX-3.7 nunca fijó una
  convención para escribir el hueco de un `cloze` (`config.answers` guarda
  las soluciones en orden, pero el enunciado es texto libre — hoy la
  persona ya escribe algo como «Let's ___ the ice.» por su cuenta). Inventar
  aquí un marcador y sustituirlo en el render sería fijar una convención de
  producto no pedida por el criterio de esta tarea. El enunciado se muestra
  tal cual se guardó; las soluciones del hueco se listan aparte.
- **Scheduling y valoración** — ningún botón «Otra vez»/«Bien»/«Fácil», sin
  fecha de vencimiento, sin tocar `learning_states` (no existe hasta
  FASE 5). Es lectura, no repaso.

## 2. Tests

**E2E** (`pnpm e2e`, Playwright): extendidos los dos casos existentes de
`practice-items.spec.ts` (sin fichero nuevo — la previsualización se compone
sobre flujos que ya visitaban el detalle del ítem):

- El caso `basic_recognition`/inversa comprueba que el detalle muestra el
  enunciado («take off») antes de editar, y que «Ver respuesta» revela la
  respuesta («despegar»).
- El caso `cloze` comprueba que el enunciado se muestra tal cual
  («Let's ___ the ice.», sin sustituir ningún marcador) y que «Ver
  respuesta» revela, además de la respuesta completa, la lista de
  soluciones del hueco con su etiqueta propia.

74/74 e2e en verde (20 ficheros, sin fichero nuevo). Sin tests unitarios
nuevos: no hay caso de uso ni puerto nuevo, es presentación pura sobre un
`PracticeItem` ya cargado por el detalle existente.

**pgTAP**: sin cambios (sin migración). `pnpm db:test`: 11 ficheros / 266
aserciones, PASS.

## 3. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 27/194, build)
pnpm db:reset  6 migraciones + seed desde vacío (sin migración nueva en esta tarea)
pnpm db:test   11 ficheros / 266 aserciones, PASS (sin cambios)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       74 passed (20 ficheros; practice-items.spec.ts extendido, sin fichero nuevo)
```

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `src/app/[locale]/(app)/concepts/[conceptId]/items/[itemId]/practice-item-preview.tsx` | Nuevo. Componente de previsualización. |
| `src/app/[locale]/(app)/concepts/[conceptId]/items/[itemId]/page.tsx` | Monta `PracticeItemPreview` antes del formulario de edición. |
| `messages/{es,en}.json` | `Concepts.items.preview.{heading,hintLabel,reveal,clozeAnswersLabel}`. |
| `tests/e2e/practice-items.spec.ts` | Extendidos los 2 casos existentes con aserciones de previsualización. |
| `docs/evidence/LEX-3.11.md` | Este informe. |

Migraciones: **0**.

## 5. Riesgos y deuda

- **Sin convención de marcador de hueco** (§1) — decisión deliberada de no
  decidir por cuenta propia una convención de producto. Si en algún momento
  se quiere resaltar visualmente el hueco dentro del enunciado (no solo
  listar las soluciones aparte), hace falta que el propietario fije cómo se
  escribe ese marcador; hoy no hay ninguno que inferir con seguridad.
- **`<details>` nativo sin foco gestionado tras abrir** — al revelar la
  respuesta, el foco no se mueve a ella; aceptable para una vista de
  lectura sin flujo de formulario, pero es una asimetría con el resto de la
  biblioteca (LEX-2.10 sí gestiona el foco tras enviar un formulario). No
  se ha añadido gestión de foco para una interacción tan simple.
- Deuda arrastrada: revisión cruzada independiente §3.6. Sin segundo agente.

## 6. Estado del árbol Git

Rama `feat/lex-3-11-item-preview` desde `main` (`60c4b98`), fusionada. `main`
en `230924f`. Cierre de documentación en `docs/lex-3-11-close`.

## 7. Siguiente tarea

**LEX-3.12** — E2E, revisión de arquitectura y cierre de M3: usuario crea
mazo, concepto, inversa, busca, edita y archiva; segundo usuario no accede;
límites de capas y CI verdes. Depende de LEX-3.1…3.11 (todas `HECHO`). Cierra
FASE 3 / M3. No se inicia aquí.
