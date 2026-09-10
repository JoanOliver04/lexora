# Formato de importación TXT/CSV

Caracterización del formato de archivo que la importación de FASE 4 debe
leer (`MASTER_SPEC.md` §9.7). Puerto y parser reales: LEX-4.2. Validación y
saneamiento: LEX-4.5, [`SECURITY.md`](SECURITY.md). Esta página describe la
**forma** del archivo, no cómo se procesa.

> **Origen de esta caracterización:** LEX-4.1 partió del formato público del
> exportador de Anki («Notes in Plain Text») porque el dataset real no
> estaba en el clon. **LEX-4.10 (2026-09-10)** lo contrastó con los 10 TXT
> privados de `07_Recursos/Anki_Mazos` (1.016 filas de datos). El contenido
> de las tarjetas **no** se versiona. Hallazgos de estructura abajo; si el
> dataset cambia, se vuelve a medir.

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
- Validación y saneamiento (5 MB / 10.000 filas antes de parsear, longitud
  de campo, nombre de archivo, HTML a texto plano, `row_sample` ≤ 200) →
  LEX-4.5, [`SECURITY.md`](SECURITY.md). Neutralizar fórmulas al **exportar**
  CSV no es de esta fase.
- Mapeo de columnas en pantalla y vista previa → LEX-4.4.
- Clasificación de duplicados → LEX-4.6 (`canonical_key` de LEX-3.10).
  Una fila válida es **nueva** o **posible duplicada** si el frente normaliza
  a la misma clave que un concepto vivo del curso, o que otra fila anterior
  del archivo. Estrategias en la vista previa: omitir o crear copia. No se
  actualiza un concepto existente (no hay criterio seguro de «es el mismo»).
  Ejecutar: LEX-4.7. Cada confirmación es un trabajo nuevo; `skip` no
  duplica la biblioteca, `copy` crea conceptos independientes. Un frente
  más largo que el título de concepto (200) o un reverso más largo que el
  ítem (500) se registra como fallo de esa fila y el lote sigue. El mazo
  de destino tiene que existir ya en el curso. Tras ejecutar (LEX-4.9) el
  resumen muestra creadas/omitidas/duplicadas/fallidas/total, que cuadran
  con el trabajo, y lista las filas fallidas (descargables en texto plano).
  Reintentar es otro trabajo: no se reutiliza un job `completed`.

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
