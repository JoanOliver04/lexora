# LEX-3.10 — Sugerir duplicados mediante `canonical_key`

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-10-duplicate-suggestion`
**Estado resultante:** `EN PROCESO` → `HECHO` al fusionar con CI verde.

---

## 1. Alcance

Primer uso real de `concepts.canonical_key` (existe desde LEX-3.2, índice
`(owner_id, canonical_key)` desde LEX-3.3): hasta ahora nada la leía.
`createConceptAction` insertaba sin consultarla primero.

**Entregado:**

- `ConceptRepository.findByCanonicalKey`: conceptos vivos del curso con la
  misma `canonical_key` exacta, sobre el índice ya existente. Sin migración.
- `findDuplicateConcepts` (caso de uso): normaliza el título tecleado con el
  `canonicalKey()` del dominio (LEX-3.1 — conserva acentos a propósito) y
  delega. Un título en blanco no consulta.
- `createConceptAction`: antes de crear, si hay coincidencias y la persona no
  ha confirmado todavía, **no crea** — devuelve las coincidencias para que la
  pantalla las muestre. Un segundo envío del mismo formulario, una vez visto
  el aviso, cuenta como confirmación (`confirmDuplicate`, ver §2). **Nunca
  fusiona ni sobrescribe**: crear de todos modos crea un concepto nuevo e
  independiente, como si no hubiera coincidencia — `canonical_key` no tiene
  índice único, es sugerencia, no restricción.
- `CreateConceptForm`: al ver una coincidencia, la lista con enlace a su
  detalle (título + tipo) y el mismo botón de envío cambia de «Crear
  concepto» a «Crear de todos modos».

**Fuera de alcance, declarado:**

- **Edición** (`updateConceptAction`) — cambiar un concepto para que
  coincida con otro no dispara el aviso. El riesgo real es crear un
  duplicado sin darse cuenta, no renombrar uno existente hasta colisionar;
  ampliarlo a edición es alcance no pedido por el criterio de la tarea.
- **Filtrar por `kind`** en la comparación — «Present perfect» como
  `grammar` y como `vocabulary` (hipotético) comparten `canonical_key` pero
  son conceptos distintos en la práctica. Se muestra el `kind` de cada
  coincidencia en el propio aviso para que la persona lo vea y decida; no se
  excluye de la consulta, porque hacerlo silenciaría justo el caso donde el
  aviso más ayuda (un duplicado real con otro `kind` puesto por error).
- **LEX-4.6** (plan de duplicados de importación masiva, `skip`/`copy`/
  actualización) — pipeline distinto, ya lo declaraba el roadmap.

## 2. Un hallazgo real: el reinicio automático del formulario

`<form action={fn}>` de React 19 reinicia los campos no controlados a su
`defaultValue` tras **cualquier** resolución de la Server Action que no
navegue — no solo tras un éxito. Esto lo expuso el propio diseño de esta
tarea: el primer intento usaba un **segundo `<button>`** con
`name="confirmDuplicate" value="1")` para «Crear de todos modos»; el e2e
falló porque, al ver el aviso de duplicado (la acción resuelve sin navegar),
React ya había vaciado `title`/`summary` antes de que la persona pudiera
pulsar ese segundo botón — el segundo envío llegaba con los campos vacíos y
fallaba la validación por «título vacío», no por nada relacionado con el
propio duplicado.

**Corregido con dos cambios, no uno:**

1. **Un solo botón, no dos.** El botón de envío cambia su propio texto
   («Crear concepto» → «Crear de todos modos») según `duplicates.length`, y
   un campo oculto `confirmDuplicate` refleja ese mismo booleano en cada
   render — evita depender de qué botón concreto disparó el envío.
2. **Eco de los valores tecleados.** `ConceptFormState` gana `values`: la
   Server Action, en cualquier camino que no cree (duplicados, `issues` de
   validación, error genérico), devuelve lo que la persona tecleó tal cual;
   `CreateConceptForm` lo pasa como `defaults` a `ConceptFields`. Así el
   reinicio de React reinicia los campos **a lo que ya había**, no a vacío.

El segundo punto es, en rigor, una corrección de un defecto ya presente desde
LEX-3.6 (una validación fallida en la creación de un concepto —p. ej. resumen
vacío— ya perdía el título correcto que la persona había escrito bien), solo
que ningún test lo había ejercido hasta que el flujo de confirmación de esta
tarea lo hizo observable. Se corrige aquí porque el propio criterio de LEX-3.10
depende de que sobreviva un segundo envío; **no** se ha extendido al resto de
formularios de creación (`decks`, `practice-item`) — mismo patrón, mismo
defecto probable, pero fuera del alcance declarado (§1) y anotado como deuda
(§7).

## 3. Tests

**Unitarios** (`pnpm test`, vitest): `concept.test.ts` (+3:
`findDuplicateConcepts` normaliza y delega / título en blanco no consulta /
usuario vacío). 194/194 en verde (27 ficheros).

**E2E** (`pnpm e2e`, Playwright): `concepts.spec.ts` +1 caso — crea un
concepto; intenta crear el mismo título con mayúsculas/espacios distintos →
aviso de duplicado, **no** crea todavía (se comprueba por la ausencia del
título exacto tal como se tecleó, no solo por la presencia del aviso);
«Crear de todos modos» → crea un segundo concepto distinto, ambos visibles;
un título con acento distinto (`canonicalKey` distinta, `café`/`cafe`) no
dispara el aviso. 74/74 e2e en verde (20 ficheros).

**pgTAP**: sin cambios (sin migración). `pnpm db:test`: 11 ficheros / 266
aserciones, PASS.

## 4. Verificación por rotura

La verificación por rotura de esta tarea fue el propio descubrimiento del
reinicio de formulario (§2): el e2e con el diseño de dos botones falló de
forma reproducible con «título vacío» donde se esperaba un concepto creado —
señal clara de que el problema no era el flujo de confirmación en sí (el
botón «Crear de todos modos» sí se localizaba y se pulsaba) sino el estado
del formulario en el momento del segundo envío. Confirmado con una captura de
pantalla del fallo (campos vacíos, botón todavía en su etiqueta por defecto)
antes de diagnosticar la causa.

## 5. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 27/194, build)
pnpm db:reset  6 migraciones + seed desde vacío (sin migración nueva en esta tarea)
pnpm db:test   11 ficheros / 266 aserciones, PASS (sin cambios)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       74 passed (20 ficheros; +1 caso de esta tarea)
```

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/library/application/concept.ts` | +`ConceptRepository.findByCanonicalKey`; +`findDuplicateConcepts`. |
| `src/modules/library/application/concept.test.ts` | +3 tests; fake actualizado con `findByCanonicalKey`. |
| `src/modules/library/infrastructure/supabase-concept-repository.ts` | +`findByCanonicalKey`. |
| `src/app/[locale]/(app)/concepts/actions.ts` | `createConceptAction`: comprobación de duplicados antes de crear; `ConceptFormState` gana `duplicates`/`values`; `fieldValuesFromForm` nuevo. |
| `src/app/[locale]/(app)/concepts/create-concept-form.tsx` | Aviso de duplicados, botón de envío con etiqueta dinámica, campo oculto `confirmDuplicate`, `defaults` desde `state.values`. |
| `messages/{es,en}.json` | `Concepts.duplicates.{heading,createAnyway}`. |
| `tests/e2e/concepts.spec.ts` | +1 caso (sugerencia de duplicados). |
| `docs/evidence/LEX-3.10.md` | Este informe. |

Migraciones: **0**.

## 7. Riesgos y deuda

- **El mismo defecto de reinicio de formulario (§2) probablemente afecta a
  otros formularios de creación** (`CreateDeckForm`, `CreatePracticeItemForm`,
  posiblemente `attachTagAction`): una validación fallida pierde lo que la
  persona ya había escrito bien en otros campos. No corregido ahí — fuera del
  alcance declarado de esta tarea, que solo necesitaba sobrevivir su propio
  segundo envío. Deuda anotada explícitamente para quien la retome.
- **Sin filtro por `kind`** en la comparación (§1) — decisión deliberada, no
  vacío: mostrar el `kind` de cada coincidencia delega la decisión final en
  la persona en vez de silenciar casos reales.
- **Solo en creación, no en edición** (§1) — el riesgo de duplicado real está
  en crear, no en editar.
- Deuda arrastrada: revisión cruzada independiente §3.6. Sin segundo agente.

## 8. Estado del árbol Git

Rama `feat/lex-3-10-duplicate-suggestion` desde `main` (`daaed21`). Pendiente:
commit, PR contra `main`, CI verde en los tres trabajos, merge, CI verde en
`main`, cierre docs.

## 9. Siguiente tarea

**LEX-3.11** — Crear previsualización de ítems (renderiza frente/respuesta/
hint y modo como se verá al estudiar; sin scheduling ni valoración todavía).
Depende de LEX-3.7 (`HECHO`). No se inicia aquí.
