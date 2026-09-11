# Repetición espaciada

Cómo se integra FSRS en Lexora. La decisión sobre qué entidad se programa está en
[ADR-003](adrs/ADR-003-fsrs-programa-practice-item.md).

> **Estado (LEX-5.9, 2026-09-11):** spike, adaptador, config v1, esquema,
> RLS, alta, cola, cálculo de repaso y **commit atómico**. `ts-fsrs@5.4.2`.
> Sin UI.

Fuentes oficiales leídas: README de
[`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs),
`packages/fsrs/README.md`, tipos de `5.4.2`, `CHANGELOG.md`. No se
usa `6.0.0-beta`: no es `latest`, y un major exige ADR + migración
(§14.7) antes de aplicarse.

## Qué se programa

El estado de memoria pertenece a la pareja *(usuario, `PracticeItem`)*: una
competencia concreta sobre un concepto, no el concepto entero ni cada variante
visual del enunciado.

Consecuencias directas:

- Saber reconocer una palabra no marca como dominada su producción.
- Activar una competencia nueva sobre un concepto ya conocido inicia su propio aprendizaje.
- El límite diario de elementos nuevos cuenta competencias, no conceptos.
- El número de competencias activas por concepto debe mantenerse controlado, o la carga diaria se multiplica.

## El algoritmo no se reimplementa

Lexora usa [`ts-fsrs@5.4.2`](https://www.npmjs.com/package/ts-fsrs), la
implementación mantenida por Open Spaced Repetition. Implementa
**FSRS-6** (21 pesos `w`). No se reescribe la matemática del algoritmo,
ni en TypeScript ni dentro de PostgreSQL.

Lo que sí es responsabilidad del proyecto: el mapeo de datos, el versionado, la
atomicidad de la escritura y la corrección del tiempo.

El optimizador [`@open-spaced-repetition/binding`](https://www.npmjs.com/package/@open-spaced-repetition/binding)
**no** se añade: la V1 no entrena parámetros. `rollback` / `forget` /
`reschedule` existen en la librería; deshacer un repaso sigue fuera de
la V1. `Rating.Manual` (0) no es una valoración de usuario: la UI solo
ofrecerá Again / Hard / Good / Easy (`Grades`).

## Puerto y adaptador

La librería vive detrás de un puerto. Ningún componente ni caso de uso importa
`ts-fsrs` directamente.

```ts
interface SpacedRepetitionScheduler {
  createInitialState(now: Date, config: SchedulerConfig): LearningState;
  preview(state: LearningState, now: Date, config: SchedulerConfig): RatingPreview[];
  review(state: LearningState, rating: ReviewRating, now: Date, config: SchedulerConfig): ReviewTransition;
}
```

`createTsFsrsScheduler()` (LEX-5.2) implementa este puerto y traduce
entre los tipos internos (`LearningState`, `ReviewRating`) y los de la
librería. Si la librería cambia su API, cambia el adaptador y nada más.
Composición: `createSpacedRepetitionScheduler()` en `src/composition/study.ts`.

API observada en 5.4.2 (el adaptador llamará a esto, el dominio no):

| Producto (puerto) | `ts-fsrs` |
|---|---|
| `createInitialState(now)` | `createEmptyCard(now)` → `State.New`, `due = now` |
| `preview(state, now)` | `scheduler.repeat(card, now)` — las cuatro `Grade` |
| `review(state, rating, now)` | `scheduler.next(card, now, grade)` — `{ card, log }` |

`repeat` y `next` con el mismo `(card, now, Good)` coinciden. El
reloj se pasa como argumento; no se usa `Date.now()` dentro del
adaptador.

**El mapeo es explícito, campo a campo.** `Card.due` y
`Card.last_review` son `Date`. Un `JSON.stringify` de la carta no es
un esquema. Campos a traducir (LEX-5.2/5.4), sin copiar el objeto
externo:

| `Card` / `ReviewLog` | Notas |
|---|---|
| `due`, `last_review`, `log.review` | UTC ISO / timestamptz |
| `stability`, `difficulty` | números; no los escribe el cliente |
| `scheduled_days`, `learning_steps`, `reps`, `lapses` | enteros |
| `state` | `0 New / 1 Learning / 2 Review / 3 Relearning` |
| `elapsed_days` | **deprecado**, se elimina en 6.0. No es columna propia. |

`Date.prototype.scheduler` / `.diff` también están deprecados hacia
6.0: no se usan.

## Configuración

La configuración se guarda **serializada, validada y versionada**. Cada estado y
cada registro histórico anotan con qué versión del planificador y qué versión de
configuración se calcularon.

Esa anotación es lo que permitirá, más adelante, actualizar el algoritmo sin
perder la capacidad de interpretar el historial anterior.

`V1_SCHEDULER_CONFIG` (`config_version` = `v1`) es la config de
producto. Se serializa con JSON y se valida en el borde (Zod) antes
de pasarla al adaptador. Los pesos son los `default_w` de 5.4.2
**copiados**: un parche de la librería no cambia el calendario.

| Parámetro | V1 (producto) | Default librería 5.4.2 |
|---|---|---|
| `requestedRetention` | `0.9` | `0.9` |
| `maximumIntervalDays` | `36500` | `36500` |
| `enableFuzz` | **`true`** (evitar vencimientos agrupados; sembrado) | `false` |
| `enableShortTerm` | `true` | `true` |
| `learningSteps` | `['1m', '10m']` | igual |
| `relearningSteps` | `['10m']` | igual |
| `weights` | 21 pesos FSRS-6 congelados | `default_w` |

Los tests de transiciones congeladas apagan el fuzz para leer minutos
exactos. La v1 de producto lo deja encendido.

**Fuzz:** con `enable_fuzz: true` el intervalo largo cambia respecto
al modo sin fuzz, pero está **sembrado**: mismo `Card` + mismo `now`
→ mismo vencimiento. Los tests de contrato pueden ir con fuzz
apagado para leer el número exacto; no hace falta apagarlo en
producción para que sea reproducible.

**Pasos cortos:** `New` + `Good` → `Learning`, vencimiento **+10 min**
(segundo paso). `New` + `Easy` → `Review` (+8 días en el default).
Con `enable_short_term: false` la librería no aplica esos pasos.

En la V1 no hay optimización personalizada de parámetros: requiere un historial
que todavía no existe.

## Cola diaria

`assembleDailyQueue` (LEX-5.7) ordena en memoria. El adaptador solo trae
candidatos del curso: mazos no archivados, conceptos no archivados
(Q-006, sin cascada: el filtro es de lectura), ítems no archivados y
`enabled`. Un array vacío de mazos es «ninguno», no «todos».

Orden:

1. Learning y Relearning vencidos (`due_at <= now`).
2. Review vencidos.
3. New (con estado o sin fila todavía), hasta el cupo diario.

Dentro de Learning/Review: `dueAt` ascendente, desempate
`practiceItemId`. Dentro de New: solo `practiceItemId`. El cupo de
nuevos cuenta `PracticeItem` (ADR-003), restando los que hoy salieron
de `new` en un `review_log`. El límite de repasos recorta **solo**
Review; los pasos cortos no lo consumen. `hiddenDueReviews` /
`hiddenNew` existen para que la UI no afirme que no queda nada. El
día (`dayStart`/`dayEnd`) lo inyecta el llamador; LEX-5.12 lo
calculará con la zona IANA.

La cola **no** crea estados. Un New sin fila llega con
`learningStateId` nulo; `ensureLearningState` es al estudiar.

Los pasos cortos forman parte de la cola. Si un elemento vuelve a
vencer durante la sesión, reaparece. `nextDueAt` es el próximo
vencimiento futuro cuando no queda trabajo vencido.

## Transacción de repaso

`reviewPracticeItem` (LEX-5.8) calcula la transición: identidad, ítem
propio y no archivado, estado existente, `revision` esperada, reloj
inyectado, adaptador. **No escribe.**

`confirmReview` (LEX-5.9) llama a ese cálculo y, si es válido, al puerto
`ReviewCommitter`. El adaptador invoca `public.commit_review(...)`
([ADR-006](adrs/ADR-006-commit-atomico-de-repaso.md)): una transacción
`SECURITY INVOKER` que actualiza `learning_states` (`revision + 1`) y
añade el `review_logs`. PostgreSQL **no** reimplementa FSRS; aplica
propiedad (`auth.uid()`), `revision` esperada, clave de idempotencia y
los CHECK de columna. `revoke execute from public, anon`;
`grant to authenticated`.

Cada valoración pasa por un único caso de uso:

1. Validar la identidad del usuario y su propiedad sobre el elemento.
2. Comprobar la clave de idempotencia.
3. Leer el estado actual y su número de versión.
4. Obtener la hora del reloj **del servidor**.
5. Calcular la transición con el adaptador.
6. Escribir de forma atómica el nuevo estado y el registro histórico.
7. Incrementar la versión.
8. Devolver el nuevo estado y los intervalos.

**El cliente solo envía intención:** qué elemento, qué valoración, qué versión
esperaba y una clave de idempotencia. Nunca envía valores de vencimiento,
estabilidad o dificultad.

Dos garantías que se prueban explícitamente:

- **Idempotencia (LEX-5.10).** Un doble envío o un reintento de red con
  la misma clave reexpide el resultado original y un solo log. El caso
  de uso consulta la clave **antes** de calcular: si ya hay log, no llama
  al planificador. El SQL toma un candado de transacción
  (`pg_advisory_xact_lock`) sobre `(owner, clave)` para que dos reintentos
  concurrentes no vean `revision-conflict`. Dos dueños pueden reutilizar
  la misma clave.
- **Concurrencia.** Si la versión cambió porque otro dispositivo revisó antes, la
  operación devuelve conflicto y la interfaz recarga el estado. No sobrescribe en
  silencio. LEX-5.11 cubre el caso simultáneo.

El dueño **sigue pudiendo** `UPDATE` su `learning_states` por RLS
(LEX-5.5). El producto no usa ese camino. Cerrar el agujero exigiría
`SECURITY DEFINER` y quitar la política; se aplaza (ADR-006, misma
razón que ADR-005 / §12.3).

## Tiempo

El comportamiento depende del tiempo, así que el tiempo se trata como una
dependencia, no como un detalle:

- Vencimientos y momentos de revisión se almacenan en UTC.
- El día de estudio y las estadísticas diarias se calculan con la zona horaria del perfil.
- El reloj se inyecta. No hay `new Date()` repartido por el código.
- El servidor es la autoridad. El reloj del navegador es manipulable.
- Se prueban explícitamente el cambio de día, el cambio de horario estacional y la zona horaria del primer usuario.

## Actualizaciones del algoritmo

Una actualización mayor de la librería requiere, antes de aplicarse: un ADR, una
prueba de migración y regresión sobre casos congelados. Los registros históricos
se conservan para poder reconstruir estados.

`migrateParameters()` rellena un vector `w` corto hasta los 21 pesos
de FSRS-6. Eso no sustituye el ADR: un salto de paquete 5.x → 6.x
sigue siendo major (la propia librería marca `elapsed_days` y
parches de `Date` como rotos en 6.0).

La función «deshacer el último repaso» no llega en la V1. Cuando llegue, será una
operación compensatoria registrada, nunca un borrado o una edición silenciosa del
historial. La librería expone `rollback(card, log)`; no se usa todavía.

## Qué no se prueba

No se reimplementa ni se verifica matemáticamente todo el algoritmo: eso es
responsabilidad de la librería. Se prueban el contrato del adaptador, el mapeo de
campos, las configuraciones elegidas y un conjunto de transiciones conocidas.

El spike (LEX-5.1) cubre API, estados, ratings, pasos, fuzz sembrado y
ida/vuelta de parámetros. No es el adaptador.

## Relación con la inteligencia artificial

Fuera del alcance de la V1. Cuando llegue, podrá **sugerir** cómo de correcta fue
una respuesta libre, pero no escribirá el calendario. Ningún modelo escribe
directamente vencimiento, estabilidad ni dificultad.

## Alta de estado

`ensureLearningState` (LEX-5.6) crea el `New` **al estudiar o activar**
un ítem, no al crearlo en la biblioteca. Un segundo `ensure` del mismo
par `(usuario, ítem)` relee la fila y no llama al planificador. Archivar
el ítem no borra la memoria; reactivar la conserva. Reiniciar el
calendario es una acción explícita que no existe en la V1. Q-006 sigue
abierta (sin cascada en V1).

## Pendiente

- Conflicto simultáneo entre dispositivos (LEX-5.11) sobre
  `commit_review`.
- Casos congelados de migración de scheduler (LEX-5.13). El adaptador
  ya tiene transiciones congeladas (LEX-5.2).
- Q-006 (¿archivar un concepto en cascada sobre sus ítems?) condiciona
  el planificador de cola (LEX-5.7); el alta de estado (LEX-5.6) no
  introduce cascada.
