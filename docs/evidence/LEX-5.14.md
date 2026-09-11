# LEX-5.14 — Auditoría de seguridad, estrés y cierre de M5

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-14-m5-audit`
**Estado resultante:** `HECHO`. **Cierra FASE 5 / M5.**

---

## 1. Alcance

Mismo patrón que LEX-4.11 (cierre de M4) y LEX-3.12 (cierre de M3): **no
añade producto nuevo.** Recorre el gate 12.4 y los criterios de M5 sobre
LEX-5.1…5.13, cubre el hueco de «ítems importados → estudio» que el lote
nunca había encadenado, y deja la regla del reloj con el mismo tipo de
regresión que la regla de capas.

**Sin migración. Sin UI.** La pantalla de estudio, Hoy, pausa/resumen y
el E2E multidispositivo son FASE 6 / M6 (ROADMAP). MASTER_SPEC hito 5
nombra esas superficies; el recorte de M5 es el motor.

**Entregado:**

- `tests/unit/study/imported-items-study.test.ts`: un TSV público de
  FASE 4 (`basic-tab.txt`) se parsea, se importa, se activa, entra en
  la cola y se confirma. New+Good reproduce el fixture v1. La misma
  clave reexpide un solo log. Tras el Good el ítem deja de ser New y
  `nextDueAt` es +10 min.
- Inversa: 2 filas → 4 `PracticeItem` (reconocimiento + recuperación).
  Cupo diario 3 → 3 en cola, `hiddenNew = 1`. ADR-003.
- Dos dueños, mismo TSV, almacén compartido: B no ve el ítem de A ni
  lo recibe en su cola.
- `layer-rules.test.ts`: `new Date()` vacío está prohibido en dominio,
  aplicación y composición; permitido en tests, infraestructura y con
  instante explícito.
- Este informe: tabla criterio → evidencia, deuda con veredicto, §3.6
  sigue abierta, relectura de `study/`.

**Fuera de alcance:** UI de Hoy/sesión; undo; optimización de pesos;
salto 5.x→6.x; etiqueta git de hito (autorización de Joan, igual que
M3/M4).

## 2. Criterio de salida de M5 → evidencia

> M5: **cola, transición, logs, idempotencia, concurrencia y tiempo
> autoritativo correctos.** Excluye UI diaria completa y optimización
> individual. Evidencia: fixtures temporales, pgTAP/RPC, doble envío,
> conflicto entre dispositivos y revisión independiente.

| Criterio | Dónde queda demostrado |
|---|---|
| **Puerto y adaptador `ts-fsrs`** | `ts-fsrs-scheduler.test.ts`. Spike `tests/unit/fsrs/`. Dominio no importa la librería (`layer-rules`). |
| **Config v1 versionada** | `V1_SCHEDULER_CONFIG`. Zod en el borde. Pesos copiados. |
| **Esquema + RLS** | pgTAP `120` (83), `130` (45). Logs sin `UPDATE`. |
| **Alta `New` idempotente** | `learning-state.test.ts`. Archivado no borra. |
| **Cola Learning → Review → New** | `queue.test.ts`, `daily-queue.test.ts`. Cupo por `PracticeItem`. |
| **Cálculo sin escribir** | `review-practice-item.test.ts`. Preview = review. |
| **Commit atómico** | ADR-006. pgTAP `140` (16). `confirmReview`. |
| **Idempotencia** | pgTAP `150` (14). Lookup antes de calcular. Candado de transacción. |
| **Concurrencia** | pgTAP `160` (8). Conflicto con `current`. |
| **Reloj, UTC, IANA, DST** | `study-day.test.ts` (8). `Clock`. Lint `new Date()` vacío. |
| **Snapshots y salto bloqueado** | `V1_FROZEN_*`. `schedulerCompatibility`. |
| **Ítems importados (nuevo)** | `imported-items-study.test.ts`. Fixture público, no Anki privado. |
| **Aislamiento A/B** | pgTAP `130`/`140`/`150`/`160`. Encadenado import→cola (nuevo). |
| **Gate de arquitectura** | `layer-rules.test.ts` (capas + reloj, nuevo). `pnpm lint`. |
| **CI** | Cada PR de LEX-5.1…5.13. Esta, al fusionar. |

## 3. Gate 12.4

| Ítem | Veredicto |
|---|---|
| `ts-fsrs` solo tras el adaptador | Cubierto. Lint + test de la regla. |
| Estado mapeado campo a campo y versionado | Cubierto. `elapsed_days` omitido a propósito. |
| Scheduler/config en estado y logs | Cubierto (LEX-5.4 / 5.13). |
| Reloj inyectado; servidor autoritativo; UTC + IANA | Cubierto. Regresión del lint añadida aquí. |
| Fechas congeladas, medianoche, DST, `Europe/Madrid` | Cubierto (LEX-5.12). |
| Preview y commit mismo estado/configuración | Cubierto. Encadenado import→Good aquí. |
| Estado + log atómicos | Cubierto. RPC INVOKER. |
| Idempotencia por doble envío | Cubierto. También sobre ítem importado. |
| Concurrencia: dos revisiones, misma `revision` | Cubierto (LEX-5.11). |
| Logs append-only y snapshots reconstruibles | Cubierto. `DELETE` de cuenta sigue permitido (FASE 8). |
| Ningún LLM ni cliente visual escribe `due_at` / `stability` / `difficulty` | Cubierto. Sin UI. Camino de producto: Server Action → caso de uso → RPC. |
| Major del paquete bloqueado sin ADR | Cubierto. `scheduler-mismatch`. |

## 4. Relectura de `study/`

Ninguno bloquea M5. El hueco de ítems importados **se cubre aquí**.

- **`carried` no aplica:** no hay pantalla de estudio. El cliente, cuando
  exista, solo enviará intención (LEX-6.5…6.7).
- **`confirmReview` y `ensureLearningState` siguen recibiendo `now: Date`.**
  La composición inyecta `clock.now()`. No es un `new Date()` vacío en
  negocio. FASE 6 puede pasar el `Clock` entero si la UI lo necesita.
- **El dueño puede `UPDATE` su `learning_states` por RLS.** ADR-006 lo
  acepta en V1. El producto no usa ese camino. Cerrar el agujero pide
  `SECURITY DEFINER` y quitar la política; misma razón que ADR-005 / §12.3.
- **Los adaptadores de cola/estado/commit no tienen unit propio** (igual
  que los de biblioteca e importación): los cubren el caso de uso y
  pgTAP `120`–`160`.
- **`listEligibleItems` hace varias consultas.** V1, volumen de un
  usuario. Un join único sería otra tarea, no un defecto de M5.
- **`assertUserId` duplicada** en los casos de uso de estudio, la misma
  forma que en `library/` e `importing/` (LEX-3.12 §5). No se unifica aquí.
- **Q-006 sin cascada:** la cola filtra `concepts.archived_at`. Correcto
  para la opción 1. La pregunta sigue abierta.

## 5. MASTER_SPEC hito 5 vs ROADMAP M5

El hito 5 de la especificación nombra pantalla de estudio, intervalos
visibles, pausa/resumen y «el mismo usuario estudia en escritorio, abre
el móvil y ve el progreso». ROADMAP recorta M5 al motor y mueve esa
experiencia a FASE 6 / M6. Es el recorte con el que se ejecutó LEX-5.1…
5.13; no se reabre. El criterio de doble envío del hito 5 **sí** está
cubierto (LEX-5.10 + este informe). El de multidispositivo visual, no:
no hay pantalla.

## 6. Deuda: qué sigue abierto

- **UI diaria** — FASE 6. Sin ella no hay E2E de estudio ni prueba en
  Poco F5.
- **`UPDATE` directo de `learning_states` por RLS** — aceptado (ADR-006).
- **Timeout de Server Action en hosting** (LEX-4.10): ~110 s el lote de
  1.016. Arrastrado M4→M5→M6.
- **Huecos `____` como `basic_recognition`.** Producto, no de M5.
- **Cuotas de importación** — gate 12.6 / FASE 8.
- **§3.6 sigue abierta** (sin segundo agente), arrastrada M2→M3→M4→M5.
  No se declara resuelta. Ver LEX-3.12 §4.
- **LEX-3.13** pendiente (reinicio de formulario). No bloquea M5.
- **Q-005, Q-006** abiertas. No bloquean. Q-006 condiciona si más
  adelante se quiere cascada al archivar.
- **Salto `ts-fsrs` 5.x→6.x** — exige ADR + migración + regresión.
- **Etiqueta de hito** (`v0.6.0-m5` o la que decida Joan) pendiente de
  autorización, igual que M3 y M4.

## 7. Revisión cruzada §3.6 — sigue abierta

Igual que en LEX-4.11 y LEX-3.12: no hay segundo agente independiente
sobre modelo, RLS, FSRS ni la RPC. Se acepta como riesgo conocido, no
se cierra por escribirlo distinto. El gate 12.4 se recorre aquí con
evidencia ejecutada; eso no sustituye la revisión cruzada.

## 8. Puertas

```text
pnpm check    exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 56 passed + 1 skipped / 371 passed + 1 skipped, build)
pnpm db:test  17 ficheros / 477 aserciones, PASS
              (120: 83, 130: 45, 140: 16, 150: 14, 160: 8)
```

Sin migración. Sin e2e nuevo: no hay pantalla de estudio. Los e2e de
FASE 1–4 no se tocan.

Migraciones: **0**.

## 9. Archivos

| Archivo | Cambio |
|---|---|
| `tests/unit/study/imported-items-study.test.ts` | Nuevo. Importación pública → alta → cola → commit. |
| `tests/unit/architecture/layer-rules.test.ts` | Regresión del lint de `Clock`. |
| `docs/FSRS.md`, `docs/ARCHITECTURE.md` | Estado M5. |
| `docs/evidence/LEX-5.14.md` | Este informe. |

## 10. Siguiente

**FASE 5 / M5 quedan cerradas** con LEX-5.1…5.14 `HECHO`. Siguiente:
**FASE 6 — LEX-6.1** (read model de «Hoy»). Etiqueta de hito M5
pendiente de autorización de Joan, igual que M2, M3 y M4.
