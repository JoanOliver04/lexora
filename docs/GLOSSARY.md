# Glosario y convenciones de nombres

Un término, un significado. En el dominio, en el esquema, en la interfaz y en la
documentación. La ambigüedad de vocabulario es la vía más rápida a un modelo de
datos confuso.

Relacionado: [`DATA_MODEL.md`](DATA_MODEL.md) y
[ADR-003](adrs/ADR-003-fsrs-programa-practice-item.md).

---

## 1. Términos del dominio

| Término | Qué es | Qué **no** es |
|---|---|---|
| **`Course`** | Una ruta de estudio: relaciona un idioma de origen con uno de destino y configura la experiencia. | No es un temario ni un curso académico con lecciones. |
| **`Deck`** (mazo) | Agrupación organizativa de conceptos, por nivel, tema o finalidad. | **No posee el progreso.** Solo selecciona qué se quiere estudiar. |
| **`Concept`** | La unidad de conocimiento: palabra, *collocation*, expresión, regla gramatical, función comunicativa o contraste de pronunciación. | No es una tarjeta, y no acumula estado de memoria. |
| **`PracticeItem`** | Una competencia programable sobre un concepto: reconocerlo, recuperarlo, escucharlo, producirlo. | No es un ejercicio concreto en pantalla ni una variante de enunciado. |
| **`LearningState`** | El estado de memoria de un usuario para un `PracticeItem`. | No es un estado del concepto ni un porcentaje de dominio. |
| **`ReviewLog`** | Registro inmutable de un repaso, con instantánea del estado antes y después. | No es un historial editable. |
| **`StudySession`** | Agrupación de repasos para poder resumirlos. | No es una cola persistida. |
| **`Tag`** | Etiqueta del usuario sobre un concepto. | No es una categoría del sistema. |
| **`ErrorEvent`** | *(Futuro.)* Un error concreto cometido en producción libre. | No es un lapso de FSRS. |

### El caso especial: «tarjeta»

**`Card` no es una entidad.** Es el término que ve el usuario.

Lo que la pantalla renderiza es un `PracticeItem` en un formato concreto. El
código y el esquema nunca usan `Card` como entidad, porque en las herramientas de
tarjetas convencionales «card» mezcla concepto, contenido, ejercicio y estado de
memoria en una sola cosa, y esa mezcla es justo lo que este modelo separa.

| Contexto | Término |
|---|---|
| Interfaz, textos visibles, ayuda | «tarjeta» |
| Código, esquema, documentación técnica | `PracticeItem` |

### Lo que el usuario ve frente a lo que existe

| Interfaz | Modelo |
|---|---|
| Tarjeta | `PracticeItem` |
| Mazo | `Deck` |
| Palabra, expresión, regla | `Concept` |
| «Para repasar hoy» | `LearningState` con vencimiento pasado |
| «Difíciles» | Regla operativa sobre lapsos y valoraciones recientes |
| Historial | `ReviewLog` |

No se muestra al usuario vocabulario del esquema. Tampoco se afirma que domina un
nivel del MCER a partir de estadísticas de tarjetas: las métricas describen
memoria y actividad, no certificación.

---

## 2. Los cuatro idiomas

Se mantienen separados desde el principio. Mezclarlos hace imposible añadir un
segundo par de idiomas sin rehacer el núcleo.

| Concepto | Qué es | Ejemplo inicial |
|---|---|---|
| **Idioma de interfaz** | En qué idioma está la aplicación. | `es` o `en` |
| **Idioma de apoyo** | El idioma que el usuario ya domina. | `es` |
| **Idioma objetivo** | El idioma que se estudia. | `en` |
| **Variante del contenido** | La variante regional del material. | `en-GB` |

Que la interfaz esté en inglés no cambia el idioma de apoyo. Que el objetivo sea
inglés no fija la variante.

---

## 3. Convenciones de nombres

### Base de datos

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tablas | `snake_case`, plural | `practice_items` |
| Columnas | `snake_case`, singular | `due_at`, `scheduler_version` |
| Claves foráneas | `<entidad_singular>_id` | `concept_id` |
| Marcas de tiempo | Sufijo `_at`, en UTC | `created_at`, `archived_at` |
| Booleanos | Adjetivo o participio, sin `is_` | `enabled`, `active` |
| Índices | `idx_<tabla>_<columnas>` | `idx_learning_states_user_due` |
| Restricciones | `chk_`, `uq_`, `fk_` + tabla y campo | `uq_deck_concepts_deck_concept` |
| Funciones | Verbo en infinitivo, `snake_case` | `commit_review` |

### TypeScript

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tipos y entidades | `PascalCase` | `PracticeItem`, `LearningState` |
| Variables y funciones | `camelCase` | `buildDailyQueue` |
| Casos de uso | Verbo + objeto, `PascalCase` | `ReviewPracticeItem`, `ImportDelimitedFile` |
| Puertos | Sustantivo de rol, sin prefijo `I` | `SpacedRepetitionScheduler`, `ConceptRepository` |
| Adaptadores | Tecnología + puerto | `TsFsrsScheduler`, `SupabaseConceptRepository` |
| Constantes | `SCREAMING_SNAKE_CASE` | `DEFAULT_DAILY_NEW_LIMIT` |

**Sin prefijo `I` en las interfaces.** Un puerto se nombra por lo que hace, no
por lo que es técnicamente.

### Ficheros y carpetas

| Elemento | Convención |
|---|---|
| Carpetas | `kebab-case` |
| Componentes React | `PascalCase.tsx` |
| Resto de módulos | `kebab-case.ts` |
| Tests | Junto al archivo, `<nombre>.test.ts` |
| Migraciones | Marca de tiempo + descripción, según la CLI |
| Documentación | `SCREAMING_SNAKE_CASE.md` en `docs/`; ADR como `ADR-nnn-slug.md` |

### Modos de práctica

Identificadores estables, en inglés y `snake_case`. Solo los tres primeros se
activan en la V1:

```text
basic_recognition      activo en V1
basic_recall           activo en V1
cloze                  activo en V1
listening_dictation    reservado
guided_production      reservado
free_production        reservado
pronunciation          reservado
```

Los reservados existen en el dominio para no tener que migrar el esquema cuando
se activen. No aparecen en la interfaz hasta que funcionen.

### Estados de memoria

`New`, `Learning`, `Review`, `Relearning`. Nombres del algoritmo, no traducidos
en el modelo. Su presentación al usuario sí se traduce.

### Valoraciones

`Again`, `Hard`, `Good`, `Easy` en el modelo; «Otra vez», «Difícil», «Bien»,
«Fácil» en la interfaz en español.

---

## 4. Idioma de cada cosa

| Qué | Idioma |
|---|---|
| Código, identificadores, comentarios | Inglés |
| Nombres de tablas y columnas | Inglés |
| Mensajes de commit y PR | Inglés |
| Documentación del proyecto | Español |
| Interfaz | Español e inglés, mediante traducciones |

Ningún texto visible se incrusta en un componente: todo pasa por el sistema de
traducciones.

---

## 5. Nombres del proyecto

| Uso | Valor |
|---|---|
| Producto | **Lexora**, sin tilde |
| Repositorio y paquete | `lexora` |

*Pendiente:* identidad visual, dominio y nombre comercial definitivo. No se
diseña una marca antes de que el producto funcione.
