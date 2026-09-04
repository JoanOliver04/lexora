# LEX-3.12 — E2E, revisión de arquitectura y cierre de M3

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-12-m3-audit`
**Estado resultante:** `HECHO`. **Cierra FASE 3 / M3.** PR #45 fusionada a
`main` (merge `508f700`); CI verde en los tres trabajos, runs `33898407035`
(PR) y `33898825648` (merge).

---

## 1. Alcance

Mismo patrón que LEX-2.11 (cierre de M2): no añade producto nuevo. Recorre
los flujos de punta a punta, cierra el único hueco de aislamiento A/B que
FASE 3 nunca había probado en la interfaz, y hace una revisión crítica del
propio trabajo de FASE 3 — con las salvedades honestas que eso implica sin un
segundo revisor real (§4).

**Sin migración.** `db:test` sigue en 266 aserciones, `db:types` sin cambios.

**Entregado:**

- `tests/e2e/library-isolation.spec.ts` (nuevo): el hueco real, análogo al
  que `isolation.spec.ts` cerró para identidad/curso en LEX-2.11.
- Este informe: tabla de criterios de M3 → evidencia (§2), verdicto explícito
  sobre la deuda que quedaba pendiente de resolución o de decisión (§3),
  hallazgos de una relectura crítica de `library/` (§5), y el estado real de
  la revisión cruzada §3.6 (§4 — sigue abierta, no se cierra aquí).

## 2. Criterio de salida de M3 → evidencia

> M3 (§7 del roadmap): **crear/editar/buscar/archivar mazos, conceptos e
> ítems; dirección inversa correcta. Excluye scheduling y generación
> automática. Evidencia: E2E completo, RLS y gate de arquitectura.**

| Criterio | Dónde queda demostrado |
|---|---|
| **Crear/editar/archivar mazos** | `tests/e2e/decks.spec.ts` (crear, renombrar, archivar/restaurar, alta al final, reordenar, validación). pgTAP `080` (estructura), `090` (RLS), `100` (archivar sin cascada). |
| **Crear/editar/archivar conceptos** | `tests/e2e/concepts.spec.ts` (crear, editar con identidad conservada, etiquetar, archivar, validación). pgTAP `080`/`090`/`100`. |
| **Organizar** (vínculo mazo↔concepto, etiquetas) | `concepts.spec.ts` («vincular un concepto existente a un mazo desde el detalle del mazo», recuento actualizado en ambos sentidos); etiquetado por nombre con reutilización por `normalizedName`. |
| **Crear/editar/archivar ítems; dirección inversa correcta** | `tests/e2e/practice-items.spec.ts` (`basic_recognition`→inverso `basic_recall` con enunciado/respuesta intercambiados y **sin** pista arrastrada; `cloze` sin inversa, botón no ofrecido; archivar). Unit: `practice-item.test.ts` (`reverseOf`/`canReverse`, dominio puro; `createReversePracticeItem`, caso de uso). |
| **Buscar** | `decks.spec.ts`/`concepts.spec.ts` (LEX-3.9: texto `ilike`, filtro categoría/tipo/nivel, paginación, «sin resultados» ≠ «biblioteca vacía»). |
| **Sugerencia de duplicados** (`canonical_key`, §13.7) | `concepts.spec.ts` (LEX-3.10: coincidencia detectada, no crea hasta confirmar, nunca fusiona; acento distinto no avisa). |
| **Previsualización de ítems** | `practice-items.spec.ts` (LEX-3.11: enunciado visible, respuesta oculta hasta revelar, soluciones del hueco listadas para `cloze`). |
| **Sin perder historial futuro** (archivar ≠ borrar) | `supabase/tests/database/100-archive-invariants.sql` (26 aserciones: archivar no destruye referencias, restaurar no recrea nada, idempotencia; contraste con el borrado físico de `tags`). `docs/DATA_MODEL.md` §«Archivado y borrado controlado». |
| **Excluye scheduling y generación automática** | Ninguna tabla de FASE 5 (`learning_states`, `study_sessions`, `review_logs`) existe todavía; la previsualización de LEX-3.11 es lectura, sin botones de valoración. |
| **RLS** | pgTAP `090-library-rls.sql` (48 aserciones: A ve solo lo suyo, no alcanza lo de B ni por UUID conocido, `INSERT`/`UPDATE`/`DELETE` ajenos fallan o no tocan filas, `anon` nada, `service_role` salta RLS). |
| **Aislamiento A/B en la interfaz** | `tests/e2e/library-isolation.spec.ts` (**nuevo aquí**, §1): dos navegadores con sesión a la vez; A crea un mazo y un concepto; B no los ve en su lista (recuento cero, no solo ausencia de coincidencia) ni accediendo por URL directa con el UUID de A (**`404`**, verificado por el estado HTTP de la navegación, no solo por el texto de la página — la distinción real entre «la fila no existe para B» y «se le deniega el paso»); la actividad de B tampoco cambia lo que ve A. |
| **Gate de arquitectura** | `eslint.config.mjs` (reglas `no-restricted-imports` por glob, cubren `library` sin configuración específica del módulo) + `tests/unit/architecture/layer-rules.test.ts` (regresión: ejecuta ESLint contra código que viola la regla y exige que falle, para que un cambio futuro en la configuración no la desactive en silencio sin que nadie lo note). `pnpm lint` verde en las once tareas de FASE 3. |
| **Migración desde base limpia** | `pnpm db:reset`: 6 migraciones + seed desde vacío, sin pasos manuales, en cada tarea de FASE 3 que tocó esquema (LEX-3.2, 3.3). |
| **CI verde en los tres trabajos** | Cada PR de LEX-3.1…3.11 y su run de `main` tras el merge, tres trabajos cada vez (`Calidad`, `Base de datos`, `Extremo a extremo`) — enlaces en la fila de cada tarea del roadmap. Esta propia tarea: ver §6. |

## 3. Deuda de FASE 3: qué sigue abierto y con qué verdicto

Releídas las ocho evidencias (`LEX-3.1`…`LEX-3.11`) completas antes de
escribir esta tabla, no solo sus títulos:

- **Resuelto por LEX-3.9, no solo anotado — cerrado aquí explícitamente:**
  el N+1 de `listDeckConcepts` por mazo (LEX-3.5 §7) y de `listConceptTags`
  por concepto (LEX-3.6 §7) — `countConceptsByDeck`/`listForConcepts`
  los sustituyeron por una consulta agregada cada uno. Quien lea
  LEX-3.5/3.6 y vea «LEX-3.9 lo resuelve» debe saber que ya ocurrió.
- **Sigue abierto, con alcance acotado (LEX-3.9 §1/§7):** la lista de
  «conceptos disponibles para enlazar» en el detalle de un mazo
  (`decks/[deckId]/page.tsx`) sigue sin paginar. Es una sola consulta, no
  N+1 — aceptable a los volúmenes de la V1, no se retoca aquí.
- **Promovido a tarea propia — no se deja como bullet suelto:** el defecto
  de reinicio de formulario que LEX-3.10 §2 encontró y corrigió solo en
  `CreateConceptForm` (React 19 reinicia los campos no controlados a su
  `defaultValue` tras cualquier resolución de la Server Action que no
  navegue, no solo tras éxito) probablemente afecta también a
  `CreateDeckForm` y a los formularios de `practice-item` — una validación
  fallida en cualquiera de ellos pierde texto ya válido en otros campos. Es
  un defecto real, reproducible y de cara al usuario en pantallas ya
  publicadas, no una nota de diseño. Registrado como **LEX-3.13** en el
  roadmap privado, con dependencia LEX-3.10 y criterio de salida propio. No
  bloquea el cierre de M3 —los formularios funcionan, solo pierden texto ya
  válido en un reintento—, pero tampoco queda solo en un §7.
- **`reorder` de mazos y `create` siguen sin ser atómicos** (LEX-3.5 §7): N
  `update` sueltos sin transacción. Sin cambios; la colisión se sanea con la
  siguiente reordenación, aceptado desde LEX-3.5.
- **Condición de carrera en `attachTagAction`** (LEX-3.6 §7): dos pestañas
  etiquetando el mismo nombre nuevo a la vez pueden chocar. Sin cambios,
  mismo veredicto que LEX-3.6: un `rpc` transaccional si el uso real lo pide.
- **`pg_trgm` diferido, no descartado** (LEX-3.9 §7): sin volumen real que
  lo justifique. Sin cambios.
- **`Q-005` y `Q-006` siguen abiertas** en `docs/OPEN_QUESTIONS.md` — M3 las
  hace más visibles, no las resuelve: `Q-005` (¿«profesional» es nivel o
  categoría?) ya se ve en la UI de mazos desde LEX-3.5; `Q-006` (¿archivar
  un concepto en cascada sobre sus ítems?) condiciona el planificador de
  FASE 5 cuando exista. Ninguna bloquea el cierre de M3: ambas tienen
  recomendación aplicada y documentada, la decisión pendiente es del
  propietario.

## 4. Revisión cruzada independiente §3.6 — sigue abierta, no se cierra aquí

Cada evidencia de FASE 3 termina con «pendiente revisión cruzada §3.6. Sin
segundo agente». Esta tarea **no** cierra esa deuda, y merece decirse por
qué explícitamente: se consultó al `advisor` (revisor más fuerte con el
transcript completo de la sesión) sobre el propio diseño de esta tarea, pero
ese no es el mismo tipo de revisión que §3.6 pide. El `advisor` ha estado
guiando decisiones de diseño de FASE 3 a lo largo de la sesión (diferir
`pg_trgm`, resolver los recuentos agregados, etc.) — no es independiente del
trabajo que estaría revisando. Una revisión cruzada de verdad necesita a
alguien que no haya participado en las decisiones.

**Veredicto honesto:** §3.6 sigue abierta, arrastrada de M2 a M3 y de M3 a
M4, por una razón ambiental (sin segundo agente disponible en este entorno),
no por omisión. Se acepta como riesgo conocido, no se declara resuelta por
escribirlo distinto.

Lo que sí se hizo aquí, y es un ejercicio distinto: una relectura crítica
propia de `library/` con la sesión completa fresca (§5) — hallazgos
concretos, no una revisión en blanco.

## 5. Hallazgos de la relectura crítica de `library/`

Ninguno bloquea el cierre de M3; se registran para quien toque estos
ficheros a continuación, no se corrigen aquí (esta tarea es auditoría, no
refactor: corregirlos ahora sería ampliar el alcance de una tarea de cierre).

- **`assertUserId` está duplicada literalmente** en `deck.ts`, `concept.ts`,
  `tag.ts` y `practice-item.ts` (cuatro copias de la misma función de seis
  líneas). Candidata mecánica a `application/guards.ts`, junto a
  `pagination.ts` (LEX-3.9), que ya sentó el precedente de una utilidad
  compartida en `application/`.
- **El mapeo `ConceptRow → Concept` (`toConcept`) está triplicado**: una
  copia en `supabase-deck-repository.ts` (para `listConcepts`), otra en
  `supabase-concept-repository.ts` (el dueño natural), otra en
  `supabase-tag-repository.ts` (para `listConcepts`/`listForConcepts`).
  Tres copias mantenidas a mano de la misma traducción fila↔dominio: un
  campo nuevo en `Concept` que se olvide actualizar en una de las tres no lo
  cazaría ningún test hasta que esa consulta concreta lo necesite. Es el
  hallazgo con más riesgo real de los tres — una función compartida
  (`toConcept` exportada desde un sitio único, o un mapeador común en
  `infrastructure/`) lo eliminaría.
- **`safeLocale` duplicada** en `decks/actions.ts` y `concepts/actions.ts`
  (misma función, mismo cuerpo). Menor: es presentación, no dominio ni
  persistencia: el riesgo de una copia desincronizada es bajo, pero sigue
  siendo la misma lógica escrita dos veces.

## 6. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 27/194, build)
pnpm db:reset  6 migraciones + seed desde vacío (sin migración nueva en esta tarea)
pnpm db:test   11 ficheros / 266 aserciones, PASS (sin cambios)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       76 passed (21 ficheros; library-isolation.spec.ts nuevo, +2 casos)
```

## 7. Archivos

| Archivo | Cambio |
|---|---|
| `tests/e2e/library-isolation.spec.ts` | Nuevo. Aislamiento A/B de mazos/conceptos en la interfaz. |
| `docs/evidence/LEX-3.12.md` | Este informe. |

Migraciones: **0**.

## 8. Estado del árbol Git

Rama `feat/lex-3-12-m3-audit` desde `main` (`230924f`), fusionada. `main` en
`508f700`. Cierre de documentación en `docs/lex-3-12-close`.

## 9. Siguiente tarea

**FASE 3 / M3 quedan cerradas** con LEX-3.1…3.12 `HECHO`. **LEX-3.13** queda
`PENDIENTE` (corrección del reinicio de formulario, §3) sin bloquear el
hito. Siguiente fase: **FASE 4 — Importación TXT/CSV** (LEX-4.1), entrada M3.
Etiqueta de hito (`v0.4.0-m3` o la que decida Joan) **pendiente de
autorización del propietario**, igual que M2.
