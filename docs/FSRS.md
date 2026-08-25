# Repetición espaciada

Cómo se integra FSRS en Lexora. La decisión sobre qué entidad se programa está en
[ADR-003](adrs/ADR-003-fsrs-programa-practice-item.md).

> **Estado:** sin implementar. Este documento fija el contrato acordado antes de
> escribir código. Los valores concretos de configuración se decidirán tras un
> ensayo con la versión instalada de la librería, en la fase 5.

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

Lexora usa [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs), la
implementación mantenida por Open Spaced Repetition. No se reescribe la
matemática del algoritmo, ni en TypeScript ni dentro de PostgreSQL.

Lo que sí es responsabilidad del proyecto: el mapeo de datos, el versionado, la
atomicidad de la escritura y la corrección del tiempo.

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

`TsFsrsScheduler` implementa este puerto y traduce entre los tipos internos del
dominio y los de la librería. Si la librería cambia su API, cambia el adaptador y
nada más.

**El mapeo es explícito, campo a campo.** No se serializa a ciegas un objeto
externo hacia la base de datos: eso ataría el esquema a la representación interna
de una dependencia.

## Configuración

La configuración se guarda **serializada, validada y versionada**. Cada estado y
cada registro histórico anotan con qué versión del planificador y qué versión de
configuración se calcularon.

Esa anotación es lo que permitirá, más adelante, actualizar el algoritmo sin
perder la capacidad de interpretar el historial anterior.

*Pendiente de la fase 5:* retención objetivo, pasos de aprendizaje y
reaprendizaje, intervalo máximo y uso de dispersión aleatoria. Se decidirán tras
un ensayo con la versión instalada, no copiando los parámetros de otra persona.

En la V1 no hay optimización personalizada de parámetros: requiere un historial
que todavía no existe.

## Cola diaria

Orden base:

1. Elementos en aprendizaje o reaprendizaje que ya han vencido.
2. Elementos en repaso que han vencido.
3. Elementos nuevos, hasta el límite diario.

Dentro de cada grupo, criterio determinista y documentado: vencimiento
ascendente, con un desempate estable.

La selección respeta el curso, los mazos activos, lo archivado y los límites
configurados. Si un límite oculta repasos que siguen vencidos, la interfaz lo
dice: no afirma que el usuario ha terminado todo lo pendiente.

Los pasos cortos de aprendizaje forman parte de la cola. Si un elemento vuelve a
vencer durante la sesión, reaparece. Si no queda nada más y el siguiente paso aún
no ha vencido, la interfaz informa del tiempo restante o permite terminar; no
mantiene al usuario esperando.

## Transacción de repaso

Cada valoración pasa por un único caso de uso:

1. Validar la identidad del usuario y su propiedad sobre el elemento.
2. Comprobar la clave de idempotencia.
3. Leer el estado actual y su número de versión.
4. Obtener la hora del reloj **del servidor**.
5. Calcular la transición con el adaptador.
6. Escribir de forma atómica el nuevo estado y el registro histórico.
7. Incrementar la versión.
8. Devolver el nuevo estado y los intervalos.

La escritura atómica se implementa en una función de base de datos que verifica
propiedad, versión esperada, correspondencia del elemento, valoración permitida y
rangos válidos antes de escribir.

**El cliente solo envía intención:** qué elemento, qué valoración, qué versión
esperaba y una clave de idempotencia. Nunca envía valores de vencimiento,
estabilidad o dificultad.

Dos garantías que se prueban explícitamente:

- **Idempotencia.** Un doble envío con la misma clave devuelve el resultado
  anterior en lugar de registrar dos repasos.
- **Concurrencia.** Si la versión cambió porque otro dispositivo revisó antes, la
  operación devuelve conflicto y la interfaz recarga el estado. No sobrescribe en
  silencio.

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

La función «deshacer el último repaso» no llega en la V1. Cuando llegue, será una
operación compensatoria registrada, nunca un borrado o una edición silenciosa del
historial.

## Qué no se prueba

No se reimplementa ni se verifica matemáticamente todo el algoritmo: eso es
responsabilidad de la librería. Se prueban el contrato del adaptador, el mapeo de
campos, las configuraciones elegidas y un conjunto de transiciones conocidas.

## Relación con la inteligencia artificial

Fuera del alcance de la V1. Cuando llegue, podrá **sugerir** cómo de correcta fue
una respuesta libre, pero no escribirá el calendario. Ningún modelo escribe
directamente vencimiento, estabilidad ni dificultad.

## Pendiente

- Valores concretos de configuración, tras el ensayo de la fase 5.
- Decisión documentada sobre cómo se invoca la función transaccional y con qué privilegios.
- Conjunto de casos congelados que servirá de regresión ante futuras actualizaciones.
