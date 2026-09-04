# LEX-3.7 — Ítems básicos y dirección inversa

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-7-practice-items`
**Estado resultante:** `EN PROCESO` → `HECHO` al fusionar con CI verde.

---

## 1. Alcance

Tercera pantalla de la biblioteca: CRUD de ítems de práctica de un concepto
(`basic_recognition`, `basic_recall`, `cloze` — los tres únicos activables en
la V1) y su dirección inversa. Sobre `getLibraryContextForCurrentUser()` y los
casos de uso de `practice-item.ts` (LEX-3.4, ampliado aquí con
`createReversePracticeItem`). **Sin migración.** `db:test` sin cambios (240);
`db:types` limpio.

**Fuera de alcance, declarado:**

- **Previsualización** — LEX-3.11.
- **Modos futuros** (`listening_dictation`, `guided_production`,
  `free_production`, `pronunciation`) — reservados en el dominio desde
  LEX-3.1, ni siquiera se ofrecen en el `<select>` de modo.
- **FSRS y programación** — FASE 5. Un `PracticeItem` creado aquí no tiene
  todavía estado de repaso.

## 2. Forma

### Ruta

Colgada de `concepts/[conceptId]/`, como el bloque de tags de LEX-3.6:

| Archivo | Qué es |
|---|---|
| `concepts/[conceptId]/page.tsx` (ampliado) | Sección «Ítems de práctica»: lista (modo, `enunciado → respuesta`, distintivo de archivado, enlace «Editar», botón «Crear el inverso» cuando `canReverse(item.mode)` y no está archivado) + formulario de alta. |
| `concepts/[conceptId]/items/[itemId]/page.tsx` | Detalle/edición de un ítem. `PracticeItemRepository` no tiene `get` (LEX-3.4): se lee la lista del concepto —incluidos los archivados— y se busca por id, como el detalle de mazo (LEX-3.5). |
| `concepts/actions.ts` (ampliado) | +`createPracticeItemAction` / `updatePracticeItemAction` (`useActionState`), `setPracticeItemArchivedAction`, `reversePracticeItemAction`. |
| `create-practice-item-form.tsx`, `edit-practice-item-form.tsx` | Cliente, mismo patrón que los de concepto/mazo. |
| `practice-item-fields.tsx` | Campos compartidos. El `<select>` de modo ofrece **solo `V1_PRACTICE_MODES`** (los tres activables), no los siete de `PRACTICE_MODES` — no basta con que el dominio rechace los demás con `mode.notAvailableInV1`, la interfaz no debe ni ofrecerlos. |
| `message-key.ts` (ampliado) | +`practiceItemIssueKey`. |

Misma puerta de onboarding repetida por página (deuda ya anotada).

### `config` según el modo, sin JS que muestre/oculte campos

`basic_recognition` y `basic_recall` no llevan `config` propio (`{ mode }` a
secas); `cloze` lleva `answers: string[]`. La `<textarea>` de soluciones del
hueco se muestra **siempre**, con una nota de cuándo se usa —mismo principio
que el resto de la biblioteca: sin estado de cliente para condicionar qué
campo se ve—. `actions.ts` decide la forma final de `config` según el `mode`
elegido en el envío; el dominio (`validatePracticeItemDraft`) es quien de
verdad limpia y valida las soluciones (recorta, descarta vacías, exige que
quede alguna).

### Dirección inversa: nuevo caso de uso, no lógica de dominio en la pantalla

`reverseOf` (dominio, LEX-3.1) produce **otro borrador del mismo concepto**.
Envolverlo en un caso de uso propio —`createReversePracticeItem(repository,
ownerId, item)`— en vez de llamar a `reverseOf` directamente desde la Server
Action mantiene la regla de capas: la presentación llama a casos de uso, no a
funciones de dominio sueltas para construir un borrador que luego persiste.
El caso de uso:

1. Llama a `reverseOf(item)`; `null` si el modo no tiene inversa (todos salvo
   `basic_recognition`/`basic_recall`) — el llamador no debería ofrecer el
   botón en ese caso, pero el caso de uso no lo asume.
2. Revalida el borrador resultante con `validatePracticeItemDraft` (defensa,
   no el camino esperado a fallar: el borrador de `reverseOf` ya es válido por
   construcción).
3. Delega en `repository.create` con **el mismo `conceptId`** que el original.

`reversePracticeItemAction` (presentación) lee el ítem por id (mismo rodeo que
el detalle, sin `get` en el puerto) y llama al caso de uso; si `reverseOf`
devuelve `null`, no pasa nada (defensa en profundidad, no se ofrece el botón
para esos modos).

### Errores

- **Dominio** (`PracticeItemIssue`, 9 miembros) → `Concepts.items.errors.*`
  vía `practiceItemIssueKey`.
- **Adaptador** (`LibraryError`): `error: "generic"` + `console.error`, mismo
  patrón que mazos/conceptos/tags.

### i18n

`Concepts.items.*` (paralelo a `Concepts.tags.*`): campos, los tres modos
activables, acciones (incluida «Crear el inverso»), estado vacío, errores.

## 3. Tests

`pnpm test` → **27 ficheros, 179 tests, PASS** (26 / 174 previos + 5 nuevos, un
fichero nuevo):

| Fichero | Casos nuevos |
|---|---|
| `src/modules/library/application/practice-item.test.ts` | +3 — `createReversePracticeItem`: intercambia enunciado/respuesta del mismo concepto; `null` si el modo no tiene inversa (`cloze`); rechaza `ownerId` vacío. |
| `tests/unit/messages/practice-item-error-keys.test.ts` | +2 — `practiceItemIssueKey` transforma la clave; cada `PracticeItemIssue` tiene mensaje en `es` y `en`. |

**E2E** `tests/e2e/practice-items.spec.ts` (nuevo), 3 casos × 2 dispositivos:

1. **crear un ítem básico, editarlo, crear su inverso** — modo por defecto
   (`basic_recognition`), editar añadiendo una pista, crear el inverso →
   aparece un segundo ítem `basic_recall` con enunciado/respuesta
   intercambiados y **el original sigue ahí** (dos ítems, no uno sustituido).
2. **cloze + archivar** — un ítem `cloze` no ofrece «Crear el inverso»
   (`canReverse` es falso para ese modo); archivar desde el detalle → vuelve
   al concepto con el distintivo «Archivado».
3. **validación** — sin enunciado → no se crea, mensaje, `aria-invalid="true"`.

Aislamiento A/B **no se repite**: lo cubre pgTAP `090` (LEX-3.3).

**Lección de autoría del propio e2e**, no del producto: el primer intento del
caso 2 (cloze) falló de forma intermitente-parecida a un flake porque el test
clicaba «Editar» y, sin esperar a que la navegación al detalle del ítem
terminara, clicaba «Archivar» inmediatamente — Playwright no espera una
transición de cliente tras `.click()` en un enlace, así que el segundo click
podía resolver contra el botón «Archivar» **del concepto** (todavía montado)
en vez del botón del ítem, archivando el concepto en lugar del ítem. Corregido
añadiendo `await expect(page).toHaveURL(/\/items\/…$/)` entre ambos clics —
mismo tipo de espera explícita que ya usaba el caso 1. No es un fallo de la
aplicación: **es la clase de trampa** que motivó el aviso del asesor en
LEX-3.5 sobre no asumir que un clic espera su navegación.

## 4. Verificación por rotura

- **Regla de capas.** `import` de
  `@/modules/library/infrastructure/supabase-practice-item-repository` en
  `concepts/actions.ts` → `pnpm lint` falla (misma regla que en LEX-3.5/3.6).
  Revertido.
- **Guarda de identidad de `createReversePracticeItem`.** Quitar
  `assertUserId(ownerId)` → falla **solo**
  `practice-item.test.ts › createReversePracticeItem › rechaza un
  identificador de usuario vacío` (23/24 en el fichero). Restaurado.

## 5. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 27 ficheros/179, build)
pnpm db:test   10 ficheros / 240 asserciones, PASS (sin cambios: LEX-3.7 no toca SQL)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       66 passed (escritorio + Poco F5); practice-items.spec ×6 nuevos
```

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/library/application/practice-item.ts` | +`createReversePracticeItem`. |
| `src/modules/library/application/practice-item.test.ts` | +3 casos. |
| `src/app/[locale]/(app)/concepts/{create,edit}-practice-item-form.tsx`, `practice-item-fields.tsx` | Nuevos. |
| `src/app/[locale]/(app)/concepts/[conceptId]/items/[itemId]/page.tsx` | Nuevo. |
| `src/app/[locale]/(app)/concepts/[conceptId]/page.tsx` | +sección «Ítems de práctica». |
| `src/app/[locale]/(app)/concepts/actions.ts` | +4 Server Actions de ítems. |
| `src/app/[locale]/(app)/concepts/message-key.ts` | +`practiceItemIssueKey`. |
| `messages/{es,en}.json` | `Concepts.items.*`. |
| `tests/unit/messages/practice-item-error-keys.test.ts` | Nuevo. |
| `tests/e2e/practice-items.spec.ts` | Nuevo. |
| `docs/evidence/LEX-3.7.md` | Este informe. |

Migraciones: **0**. `docs/DATA_MODEL.md` sin cambios (el esquema no se toca).

## 7. Riesgos y deuda

- **Sin `get` en `PracticeItemRepository`** (heredado de LEX-3.4, patrón ya
  aceptado en mazos): el detalle de ítem lee la lista completa del concepto y
  filtra. Asumible al volumen de la V1.
- **`clozeAnswers` siempre visible** en el formulario, sin JS que la
  oculte/muestre según el modo elegido: coherente con el resto de la
  biblioteca, pero un usuario en modo `basic_recognition` ve un campo que no
  se usa. Un formulario dependiente del modo con estado de cliente se dejaría
  para cuando haga falta más interacción (p. ej. LEX-3.11).
- **Reversa de una reversa**: crear el inverso de un `basic_recall` genera
  otro `basic_recognition` — nada impide encadenar inversos de inversos
  indefinidamente, produciendo duplicados funcionales. No es un caso de uso
  previsto (el botón está pensado para «tengo reconocimiento, quiero también
  recuperación»), pero tampoco se bloquea. Aceptado; no es un criterio de la
  tarea.
- Deuda arrastrada: revisión cruzada independiente §3.6. Sin segundo agente.

## 8. Estado del árbol Git

Rama `feat/lex-3-7-practice-items` desde `main` (`1e719fc`). Pendiente:
commit, PR contra `main`, CI verde en los tres trabajos, merge, CI verde en
`main`, cierre docs.

## 9. Siguiente tarea

**LEX-3.8** — Definir archivado y borrado controlado: entidad con
dependencias se archiva, reactivación segura, no se destruyen referencias,
tests que anticipan historial sin crearlo todavía. Depende de LEX-3.5…3.7. No
se inicia aquí.
