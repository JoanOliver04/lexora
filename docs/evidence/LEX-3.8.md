# LEX-3.8 — Definir archivado y borrado controlado

**Fecha:** 2026-09-04
**Rama:** `feat/lex-3-8-archive-invariants`
**Estado resultante:** `EN PROCESO` → `HECHO` al fusionar con CI verde.

---

## 1. Alcance

No añade pantallas. Fija por escrito la política transversal de archivar/
borrar de la biblioteca —cada tabla ya la decidió por su cuenta al
construirse (LEX-3.2…3.7)— y la cubre con pgTAP que hoy no existía como tal:
que archivar una entidad con dependencias no destruye referencias, que
restaurar es seguro sin recrear nada, y que la política es idempotente.
**Sin migración**: la política actual (documentada aquí) ya es la que estaba
construida; no hacía falta cambiar el esquema para cumplirla.

**Fuera de alcance, declarado:**

- **Tabla de historial** — FASE 7. Los tests de este lote se escriben para
  seguir siendo válidos cuando esa tabla llegue (no comprueban su ausencia
  como si fuera un defecto).
- **Cambiar el comportamiento actual** — esta tarea documenta y prueba lo que
  ya hay, no lo cambia. Si el uso real pide cascada de archivado (Q-006), es
  una migración correctiva aparte.

## 2. La política, en una tabla

| Se archiva (`archived_at`, sin `DELETE`) | Se borra de verdad (sin historial) |
|---|---|
| `decks`, `concepts`, `practice_items` | `tags`, `deck_concepts`, `concept_tags` |

Documentado en `docs/DATA_MODEL.md` §«Archivado y borrado controlado
(LEX-3.8)», con las tres afirmaciones del criterio de la tarea desglosadas:

- **«Entidad con dependencias se archiva»** — archivar es un `UPDATE`, nunca
  toca otra tabla. Cada entidad archivable es dueña de su propio
  `archived_at`: **sin cascada** entre `decks` → `concepts` →
  `practice_items`.
- **«Reactivación segura»** — restaurar (`archived_at = null`) no necesita
  recrear nada: los enlaces y filas hijas nunca se tocaron.
- **«No se destruyen referencias»** — ningún `UPDATE archived_at` hace un
  `DELETE` en cascada. Contraste deliberado: borrar (no archivar) una
  etiqueta **sí** cascada su enlace `concept_tags` (`on delete cascade`,
  LEX-3.2) — es el borrado físico el que cascada, nunca el archivado.

**Efecto de visibilidad ya decidido, ahora documentado explícitamente:**
archivar un concepto no rompe su enlace con un mazo (`deck_concepts` sigue
ahí), pero `listDeckConcepts` (LEX-3.4) sí filtra los conceptos archivados al
leer — un mazo puede parecer haber perdido conceptos sin que el vínculo se
haya roto. Es el mismo patrón que «un mazo archivado sale de la lista por
defecto»: visibilidad, no destrucción. No es una laguna; es la lectura la que
filtra, no el dato el que desaparece.

## 3. Q-006 registrada, no bloqueante

**¿Archivar un concepto debería archivar en cascada sus `practice_items`?**
Hoy no lo hace: un ítem de un concepto archivado sigue con `archived_at =
null`, visible si se entra a su detalle por URL directa, aunque el concepto
que lo agrupa ya no aparezca en listas. FASE 5 (FSRS) no existe todavía, así
que hoy esto no tiene ningún efecto observable en un flujo de repaso real.

Registrada en `docs/OPEN_QUESTIONS.md` como **Q-006**, `ABIERTA`,
**no bloqueante**: la opción recomendada (sin cascada, comportamiento actual)
es la que se documenta y prueba en esta tarea. Si Joan decide lo contrario más
adelante, el impacto está acotado en la entrada: una función que archive
concepto + ítems en una operación atómica, y decidir qué pasa con los ítems
que la persona ya había archivado ella misma antes.

## 4. Tests

**pgTAP** `supabase/tests/database/100-archive-invariants.sql` (nuevo), 26
aserciones, autocontenido (usuario e idiomas `zz` propios, como 080/090):

- Estructura: `decks`/`concepts`/`practice_items` tienen `archived_at`;
  `tags` no.
- Archivar/restaurar un **mazo**: no archiva su concepto; el enlace
  `deck_concepts` sigue ahí antes y después, sin necesidad de recrearlo.
- Archivar/restaurar un **concepto**: no archiva el mazo que lo contiene; los
  enlaces `deck_concepts` y `concept_tags` siguen ahí; sus dos
  `practice_items` siguen existiendo **y sin archivarse** (la prueba directa
  de Q-006, opción 1).
- Archivar un **ítem**: no archiva su concepto ni al ítem hermano del mismo
  concepto.
- **Idempotencia**: archivar un ítem ya archivado no falla; restaurar un mazo
  ya restaurado no falla.
- **Contraste**: borrar una etiqueta sí cascada su enlace `concept_tags`.

`pnpm test` (vitest) sin cambios: esta tarea no toca TypeScript. `pnpm e2e`
sin cambios: no toca pantallas ni rutas.

## 5. Verificación por rotura

Se quitó temporalmente la fila de fixture `deck_concepts` (el enlace
mazo-concepto) y se relanzó `pnpm db:test`: fallan **exactamente** las tres
aserciones que dependen de ese enlace («el enlace mazo-concepto sigue ahí:
archivar no destruye referencias», «…no necesitó recrearse», «…sigue ahí tras
archivar el concepto»; tests 8, 11 y 14), 23/26 siguen en verde. Confirma que
esas aserciones detectan de verdad la ausencia del enlace y no son vacuas.
Restaurada la fixture → 26/26 de nuevo.

## 6. Puertas

```text
pnpm check     exit 0 (format, lint, typecheck, contraste 18/18, vitest 27 ficheros/179, build)
pnpm db:reset  6 migraciones + seed desde vacío (sin migración nueva en esta tarea)
pnpm db:test   11 ficheros / 266 asserciones, PASS (100 nuevo: 26; resto sin cambios)
pnpm db:types  sin cambios (no hay migración)
pnpm e2e       66 passed (sin cambios: LEX-3.8 no toca pantallas)
```

## 7. Archivos

| Archivo | Cambio |
|---|---|
| `supabase/tests/database/100-archive-invariants.sql` | Nuevo. 26 aserciones. |
| `docs/DATA_MODEL.md` | +sección «Archivado y borrado controlado (LEX-3.8)». |
| `docs/OPEN_QUESTIONS.md` | +Q-006 (cascada de archivado concepto→ítems), `ABIERTA`, no bloqueante. |
| `docs/evidence/LEX-3.8.md` | Este informe. |

Migraciones: **0**.

## 8. Riesgos y deuda

- **Q-006 sigue abierta.** No bloquea nada hoy; sí condiciona el diseño del
  planificador de FASE 5 (¿filtra por `concepts.archived_at` al armar la
  cola, o confía en que los ítems huérfanos nunca lleguen ahí?). Anotado como
  entrada de la propia Q-006 para que FASE 5 la retome.
- **`deck_concepts`/`concept_tags` no tienen prueba de «no se auto-borran al
  pasar el tiempo»** porque no hay ningún mecanismo (TTL, job) que pudiera
  hacerlo — no era un riesgo real, no se ha añadido una prueba para un
  comportamiento que no existe.
- Deuda arrastrada: revisión cruzada independiente §3.6. Sin segundo agente.

## 9. Estado del árbol Git

Rama `feat/lex-3-8-archive-invariants` desde `main` (`d3466b8`). Pendiente:
commit, PR contra `main`, CI verde en los tres trabajos, merge, CI verde en
`main`, cierre docs.

## 10. Siguiente tarea

**LEX-3.9** — Implementar biblioteca con búsqueda, filtros y paginación:
buscar por título/prompt/respuesta/tag; filtrar curso/mazo/nivel/tipo/estado;
consultas paginadas sin N+1 (resuelve la deuda de N+1 anotada en LEX-3.5/3.6
para los recuentos y las etiquetas de la lista). Depende de LEX-3.4. No se
inicia aquí.
