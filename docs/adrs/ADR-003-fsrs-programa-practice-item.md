# ADR-003 — FSRS programa `PracticeItem`, no `Concept`

**Estado:** Aceptado
**Fecha:** 2026-08-26
**Decide:** propietario del proyecto

## Contexto

El problema que originó Lexora es concreto: se puede reconocer una palabra al
verla y aun así no ser capaz de recuperarla al hablar o escribir. Son dos
capacidades distintas y se olvidan a ritmos distintos.

La repetición espaciada la aporta una librería externa que implementa FSRS. El
algoritmo no se reimplementa; lo que hay que decidir es **a qué entidad se le
asigna un estado de memoria**, porque esa elección determina el esquema, la
carga diaria y qué significan las estadísticas.

Hay tres candidatos:

- el **concepto** —la palabra, la expresión, la regla—;
- la **competencia** sobre ese concepto —reconocerlo, recuperarlo, escucharlo, producirlo—;
- el **ejercicio concreto** que aparece en pantalla, incluida cada variante de enunciado.

## Decisión

**El estado de memoria pertenece a la pareja (usuario, `PracticeItem`), donde
`PracticeItem` es una competencia programable sobre un concepto.**

Tres entidades separadas:

- `Concept` — la unidad de conocimiento. Agrupa, pero no acumula progreso.
- `PracticeItem` — una competencia concreta sobre ese concepto. Tiene su propio
  estado y su propio calendario.
- `LearningState` — el estado de memoria de un usuario para un `PracticeItem`.

Regla que delimita la decisión: **una variación superficial del enunciado no crea
un calendario nuevo.** Dos frases con hueco distintas que miden la misma
recuperación son variantes de presentación del mismo `PracticeItem` y comparten
estado. Reconocimiento y producción, en cambio, sí son competencias distintas y
se programan por separado.

## Alternativas consideradas

**Programar el `Concept` completo.**
Descartada. Es el modelo más simple y el que produce la afirmación más falsa: que
haber recordado *achievement → logro* implica poder producir *achievement* al
escribir. Colapsa capacidades que se olvidan a ritmos diferentes en un único
número, y convierte las estadísticas en una sobreestimación sistemática del
dominio real. Precisamente el problema que el producto existe para resolver.

**Programar cada ejercicio o variante visual.**
Descartada por el motivo contrario. Multiplica la carga diaria sin añadir
información: diez frases con hueco sobre la misma palabra generarían diez
calendarios que miden lo mismo, fragmentando la señal de memoria en diez series
pobres en lugar de una fiable. Y hace que ampliar el contenido de un concepto
penalice al usuario con más repasos, lo que desincentiva enriquecer el material.

**Un estado por concepto con modificadores por competencia.**
Descartada. Intenta quedarse en medio y acaba siendo una reimplementación parcial
del algoritmo: habría que decidir cómo un fallo en producción afecta al estado de
reconocimiento, que es exactamente el tipo de matemática que la decisión de usar
una librería madura pretende evitar.

## Consecuencias

**A favor:**

- Las estadísticas describen capacidades reales y separables.
- Activar una competencia nueva sobre un concepto ya conocido inicia su propio
  aprendizaje, que es lo correcto: nunca se ha practicado.
- El modelo admite competencias futuras —dictado, producción libre,
  pronunciación— sin rehacer el esquema.

**En contra, y aceptado:**

- **Un concepto puede generar varios repasos diarios.** Es el coste directo de la
  decisión. Se mitiga controlando cuántas competencias se activan por concepto y
  manteniendo desactivados en la V1 los modos que aún no aportan valor.
- El límite diario de elementos nuevos cuenta competencias, no conceptos.
  Activar reconocimiento y recuperación para una misma palabra consume dos
  huecos. Debe quedar claro en la interfaz para que el usuario no se sienta
  engañado.
- El esquema es más complejo que el de una tabla de tarjetas: tres entidades y
  una relación de pertenencia a mazos que no duplica el progreso.
- Comparar el progreso con el de una herramienta de tarjetas convencional deja de
  ser directo.

## Cómo se verifica

- El estado de memoria solo puede escribirse referido a un `PracticeItem`.
- Tests que confirman que dos competencias del mismo concepto evolucionan de forma independiente.
- Tests de la cola diaria que confirman que el límite de nuevos cuenta competencias.
- Ni la interfaz ni ningún cliente pueden escribir directamente los campos del estado de memoria: solo envían la valoración.

## Cuándo reabrir esta decisión

- Si el uso real demuestra que la carga por concepto es insostenible incluso con
  pocas competencias activas.
- Si aparece evidencia de que dos competencias concretas están tan correlacionadas
  que programarlas por separado no aporta información.

Un cambio en esta decisión afectaría a datos históricos, así que exigiría un ADR
nuevo, una migración y pruebas de regresión sobre casos congelados.
