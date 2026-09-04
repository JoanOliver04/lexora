# Formato de importación TXT/CSV

Caracterización del formato de archivo que la importación de FASE 4 debe
leer (`MASTER_SPEC.md` §9.7). Puerto y parser reales: LEX-4.2. Validación y
saneamiento: LEX-4.5, `SECURITY.md` §16.2–16.3. Esta página describe la
**forma** del archivo, no cómo se procesa.

> **Origen de esta caracterización (LEX-4.1, 2026-09-04):** el dataset real
> de Anki del propietario (`07_Recursos/Anki_Mazos`) no estaba disponible en
> el entorno donde se escribió — no es un fichero versionado ni compartido
> con este agente. Joan decidió explícitamente proceder con el formato
> **público y documentado** del exportador de notas en texto plano de Anki
> («Export → Notes in Plain Text»), sin inventar ni suponer nada sobre
> ficheros propios suyos que no se han visto. Esta página describe ese
> formato público. **No se declara necesariamente completa**: si al importar
> el dataset real aparecen diferencias (una directiva no documentada aquí,
> un encoding distinto, un orden de columnas distinto), esta página se
> actualiza entonces — es una caracterización de partida, no la última
> palabra.

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

## Columnas

Tres columnas por fila: **frente**, **reverso**, **etiquetas** (MASTER_SPEC
§9.7). `#tags column:` puede mover la posición de la columna de etiquetas
si el archivo la declara en otro orden. Una fila con menos columnas de las
esperadas, o con frente/reverso en blanco, es inválida — el código de error
concreto y qué hacer con ella es LEX-4.5; aquí solo se caracteriza que debe
detectarse.

## Etiquetas

Jerárquicas con `::`, varias etiquetas por campo separadas por un espacio —
convención de Anki. Ejemplo: `grammar::tenses::present_perfect
vocabulary::phrasal_verbs` son dos etiquetas en el mismo campo. Coincide
con `normalizeTagName`/`tagSegments` del dominio de Lexora (LEX-3.1): el
separador de jerarquía ya es `::` en ambos sitios, sin conversión.

## Campos entrecomillados (CSV)

Cuando el separador es coma o punto y coma y un campo contiene el propio
separador, un salto de línea o comillas, el campo se entrecomilla con `"` y
las comillas internas se escapan duplicándolas (`""`) — RFC 4180 estándar,
la misma convención que sigue Papa Parse (candidata nombrada en MASTER_SPEC
§9.7).

## Fuera de alcance de esta caracterización

- El algoritmo exacto de detección de separador/cabecera → LEX-4.2.
- Validación y saneamiento (límites de tamaño/filas, HTML no ejecutable,
  neutralizar fórmulas al exportar) → LEX-4.5, `SECURITY.md` §16.2–16.3.
- Mapeo de columnas en pantalla y vista previa → LEX-4.4.
- Clasificación de duplicados → LEX-3.10 (`canonical_key`) + LEX-4.6.

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
| `hierarchical-tags.txt` | Varias etiquetas jerárquicas `::` en el mismo campo. |
| `bom-utf8.txt` | BOM UTF-8 al inicio del archivo. |
| `comment-line-not-a-directive.txt` | Una línea que empieza por `#` **después** de la primera fila de datos: debe leerse como fila literal, no como directiva. |
| `errors.txt` | Filas inválidas: frente vacío, reverso vacío, una sola columna, columnas de más. |
