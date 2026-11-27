# Formato de importación TXT/CSV

Caracterización del formato de archivo que lee la importación de Lexora.
Puerto y parser reales: LEX-4.2. Validación y
saneamiento: LEX-4.5, [`SECURITY.md`](SECURITY.md). Esta página describe la
**forma** del archivo, no cómo se procesa.

> **Origen de esta caracterización:** LEX-4.1 partió del formato público del
> exportador de Anki («Notes in Plain Text») porque el dataset real no
> estaba en el clon. **LEX-4.10 (2026-09-10)** lo contrastó con los 10 TXT
> privados de `07_Recursos/Anki_Mazos` (1.016 filas de datos). El contenido
> de las tarjetas **no** se versiona. Hallazgos de estructura abajo; si el
> dataset cambia, se vuelve a medir.

## Plantilla y preparación de un tema

En **Importar** se pueden consultar dos ejemplos de frente, reverso y
etiquetas para vocabulario, gramática o frases, ver el CSV de ejemplo y
descargarlo en UTF-8. Cada fila es una tarjeta. La plantilla empieza con
`#separator:comma` y los datos siguen directamente, sin fila de títulos.

**Preparar un tema con ChatGPT** permite elegir tema, nivel A1–C2, número de
tarjetas, idioma de las respuestas y un enfoque opcional. Se copia el prompt
y se pega en ChatGPT. La respuesta se puede subir como archivo o pegar
directamente como CSV o TSV, incluso dentro de un bloque de código de Markdown.
La gramática se importa como preguntas y respuestas y se organiza con etiquetas
como `grammar::present-perfect`. La vista previa permite revisar columnas,
filas y duplicados antes de guardar las tarjetas. En el paso de destino se
puede elegir un mazo existente o crear uno nuevo para el tema conservando la
previsualización. Lexora selecciona el mazo recién creado.

## Importar en un mazo concreto

En **Editar mazo**, **Añadir** conserva lo que hay e importa los frentes
nuevos. Compara los frentes normalizados con el mazo de destino y con las
filas anteriores del archivo. Coincidir con otro mazo del curso no impide
añadir la tarjeta al destino.

**Reemplazar** pide confirmar el destino y requiere al menos una fila válida.
Al terminar, el mazo contiene las filas válidas y únicas del archivo. Las
tarjetas anteriores se desvinculan del mazo y conservan su historial y sus
vínculos con otros mazos. Si se interrumpe el proceso antes de terminar,
el mazo conserva su contenido hasta que se complete el reemplazo.

## Encoding

UTF-8. Un BOM (`EF BB BF`) al inicio del archivo es opcional y debe
tolerarse: se descarta, nunca se trata como parte del primer campo de la
primera fila.

## Separador

Por defecto, tabulación. También se admite CSV con coma o con punto y coma.
El propio archivo puede declarar el separador con una línea directiva (ver
abajo); si no la declara, el separador se infiere del contenido o de la
extensión — el algoritmo exacto de detección es decisión de LEX-4.2, aquí
solo se caracteriza qué formatos deben reconocerse.

## Líneas directivas

Empiezan por `#`. Solo son directivas **antes de la primera fila de
datos**; una línea que empiece por `#` después de haber empezado a leer
datos es una fila literal, no una directiva — para no perder contenido de
alguien cuyo propio campo empiece por `#` (ver
`comment-line-not-a-directive.txt` en las fixtures).

| Directiva | Significado |
|---|---|
| `#separator:<valor>` | Separador del archivo (`tab`, `comma`, `semicolon`, …). |
| `#html:true`/`#html:false` | Si los campos llevan HTML embebido. Lexora no renderiza HTML importado sin sanitización estricta (`SECURITY.md` §16.2) independientemente de esta directiva. |
| `#tags column:<n>` | Columna (1-indexada) que lleva las etiquetas, si no es la última. |
| `#columns:<n>` | Número de columnas esperado. |
| `#notetype column:<n>`, `#deck column:<n>` | Propias del formato de Anki, sin equivalente en Lexora — el mazo de destino se elige en el flujo de importación (MASTER_SPEC §9.7, paso 5), nunca se infiere del archivo. Se reconocen para no tratarlas como fila de datos, pero se ignoran. |
| `#notetype:<nombre>` | Vista en el dataset real (p. ej. `#notetype:Basic`). No es `#notetype column:`. Al empezar por `#` queda entre las directivas de cabecera y no se lee como fila; el valor se ignora. |

## Columnas

Tres columnas por fila: **frente**, **reverso**, **etiquetas** (MASTER_SPEC
§9.7). `#tags column:` puede mover la posición de la columna de etiquetas
si el archivo la declara en otro orden. Una fila con menos columnas de las
esperadas, o con frente/reverso en blanco, es inválida. LEX-4.5 añade los
códigos de longitud (`front_too_long`, `back_too_long`, `tags_too_long`:
frente/reverso ≤ 4.000 caracteres, campo de etiquetas ≤ 2.000) y convierte
cualquier HTML a texto plano **antes** de validar, de modo que un frente que
solo era `<p></p>` cuenta como vacío.

## Etiquetas

Jerárquicas con `::`, varias etiquetas por campo separadas por un espacio —
convención de Anki. Ejemplo: `grammar::tenses::present_perfect
vocabulary::phrasal_verbs` son dos etiquetas en el mismo campo. Coincide
con `normalizeTagName`/`tagSegments` del dominio de Lexora (LEX-3.1): el
separador de jerarquía ya es `::` en ambos sitios, sin conversión.

## Campos entrecomillados (CSV)

Cuando el separador es **coma o punto y coma** y un campo contiene el propio
separador, un salto de línea o comillas, el campo se entrecomilla con `"` y
las comillas internas se escapan duplicándolas (`""`) — RFC 4180 estándar,
la misma convención que sigue Papa Parse (candidata nombrada en MASTER_SPEC
§9.7).

En **tabulación** (export «Notes in Plain Text» de Anki) las comillas son
**literales**: Anki no las escapa al estilo RFC. Tratarlas como delimitador
de campo fusiona filas y fabrica `too_few_columns`. LEX-4.10 lo comprobó
contra el dataset real; el parser desactiva el `quoteChar` solo si el
separador es tab. Fixture `quotes-in-tab.txt`.

## Fuera de alcance de esta caracterización

- El algoritmo exacto de detección de separador/cabecera → LEX-4.2.
- Validación y saneamiento (5 MiB antes de leer; 10.000 filas de datos y hasta
  200 columnas tras tokenizar de forma acotada; longitud
  de campo, nombre de archivo, HTML a texto plano, `row_sample` ≤ 200) →
  LEX-4.5, [`SECURITY.md`](SECURITY.md). Neutralizar fórmulas al **exportar**
  CSV no es de esta fase.
- Mapeo de columnas en pantalla y vista previa → LEX-4.4.
- Clasificación de duplicados desde **Importar** → LEX-4.6 (`canonical_key` de LEX-3.10).
  Una fila válida es **nueva** o **posible duplicada** si el frente normaliza
  a la misma clave que un concepto vivo del curso, o que otra fila anterior
  del archivo. Estrategias en la vista previa: omitir o crear copia. No se
  actualiza un concepto existente (no hay criterio seguro de «es el mismo»).
  Ejecutar: LEX-4.7 y [ADR-010](adrs/010-bounded-import-transactions.md). Cada
  nuevo intento confirmado crea un trabajo; continuar recupera el mismo. `skip` no
  duplica la biblioteca, `copy` crea conceptos independientes. Un frente
  más largo que el título de concepto (200) o un reverso más largo que el
  ítem (500) se registra como fallo de esa fila y el lote sigue. El mazo
  de destino tiene que existir ya en el curso. Tras ejecutar (LEX-4.9) el
  resumen muestra creadas/omitidas/duplicadas/fallidas/total, que cuadran
  con el trabajo, y lista las filas fallidas (descargables en texto plano).
  Ante una respuesta perdida se consulta el progreso del mismo trabajo y solo
  se envían los lotes pendientes, también con `copy`. Al recargar se selecciona
  otra vez el archivo original, conservando mapeo y opciones. «Importar otro
  archivo» inicia un intento nuevo; recuperar uno completado solo devuelve su
  resultado, sin volver a crear contenido.

## Mazos de destrezas B1

En **Importar → Mazos de destrezas B1**, elige una plantilla o abre un archivo `.lexora.json`. La plantilla ya contiene un ejemplo editable. Para abrir un CSV de tres columnas (frente, reverso, etiquetas), selecciona primero Grammar o Vocabulary. El importador clásico también sigue disponible. La plantilla de Vocabulary vincula cada palabra a sus dos direcciones. Las demás crean una pregunta por tarjeta.

Cada archivo JSON lleva `format` igual a `lexora-eoi/1`, un identificador estable `key`, `title`, `level` igual a `B1`, `skill`, `sources` y `cards`. Puedes descargar una plantilla directamente desde el editor. Conserva los identificadores al actualizar las mismas preguntas. El editor asigna claves nuevas a las preguntas y fuentes que añades. Si un archivo recupera la clave de una pregunta retirada, la vista previa pide confirmar que quieres recuperar también su historial. Al abrir un CSV en este editor, elige Grammar para practicar en una dirección o Vocabulary para crear la pareja de tarjetas. Antes de guardar, la vista previa indica altas, vínculos, actualizaciones y tarjetas que saldrían del mazo. Los significados de vocabulario que van a combinarse se muestran juntos.

| Campo de tarjeta | Uso |
| --- | --- |
| `key`, `prompt`, `answer` | Identificador, consigna y solución o modelo. |
| `type` | `short` para respuesta breve, `choice` para opciones, `written` u `oral` para producción, `imitate` o `produce` para pronunciación y `word` para vocabulario. |
| `alternatives`, `options`, `criteria`, `tags` | Listas de variantes, opciones, hasta tres criterios de autoevaluación y etiquetas. En elección múltiple la solución debe coincidir con una opción. |
| `source`, `evidence`, `clip`, `emphasis` | Clave de la fuente, cita literal del texto o la transcripción, par de segundos de inicio y fin y fragmento del modelo cuyo énfasis se resalta. |

Una fuente contiene `key`, `title` y, según el ejercicio, `text`, `transcript` o `audio`. Varias preguntas pueden citar la misma fuente. Si dos mazos comparten una fuente, usa una clave nueva para una versión distinta. Elige archivos modelo de hasta 4 MiB en MP3, Ogg, M4A, WAV o WebM. El mazo guarda la referencia al archivo privado. Desde la edición del mazo puedes descargar el JSON y cada audio con su nombre original. Conserva ambos para poder importarlos en otra cuenta o recuperar los archivos de audio. El intento grabado por el estudiante permanece en el dispositivo y se descarta al salir. Para guardar el conjunto de tu cuenta con los audios modelo, utiliza la [copia completa de Ajustes](DATA_EXPORT.md).

## Fixtures

`tests/fixtures/import/` — todas sintéticas, ninguna es contenido real del
propietario. Si en algún momento se comparte un ejemplo real, no se sube
aquí ni se usa como fixture pública (CLAUDE.md §5): un fichero real iría
bajo un directorio `no_visible_en_github/`, ya excluido globalmente por
`.gitignore`.

| Fichero | Cubre |
|---|---|
| `basic-tab.txt` | Caso base: tabulación, sin directivas, dos filas válidas. |
| `directives.txt` | Cabecera con `#separator:`/`#html:`/`#columns:`/`#tags column:`. |
| `comma.csv` | CSV con coma, sin comillas necesarias. |
| `semicolon.csv` | CSV con punto y coma. |
| `quoted-fields.csv` | Campos entrecomillados con el separador y comillas internas escapadas dentro del campo. |
| `quotes-in-tab.txt` | TSV con `"` literales en un campo (Anki no las escapa RFC 4180). |
| `hierarchical-tags.txt` | Varias etiquetas jerárquicas `::` en el mismo campo. |
| `bom-utf8.txt` | BOM UTF-8 al inicio del archivo. |
| `comment-line-not-a-directive.txt` | Una línea que empieza por `#` **después** de la primera fila de datos: debe leerse como fila literal, no como directiva. |
| `errors.txt` | Filas inválidas: frente vacío, reverso vacío, una sola columna, columnas de más. |
| `html-tags.txt` | `#html:true` con `<b>`, `<script>` y `<img onerror>`: el parser deja texto plano. |
