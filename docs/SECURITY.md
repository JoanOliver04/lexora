# Seguridad de Lexora

Autenticación, RLS y cambios de datos se documentan en los ADR y sus evidencias.
El [contrato de despliegue](DEPLOYMENT_SECURITY.md) cubre CSP/cookies, Preview,
CI y secretos; [ciclo de datos](DATA_LIFECYCLE.md) cubre exportación/borrado y
conservación. Esta sección describe cómo se trata un archivo importado. Complementa
[`IMPORT_FORMAT.md`](IMPORT_FORMAT.md) (forma del archivo) y
[`DATA_MODEL.md`](DATA_MODEL.md) (dónde se registra el trabajo). Las reglas de
producto viven en `MASTER_SPEC.md` §16; este documento registra **cómo** se
aplican en el código, sin copiar esa especificación.

> El saneamiento de importación no sustituye Auth/RLS ni límites de ejecución.
> El [ADR-010](adrs/010-bounded-import-transactions.md) define el protocolo por
> lotes, sus cuotas persistidas y la recuperación tras una respuesta perdida.

## Por qué hay más de una barrera

Un archivo de importación es contenido **no confiable**: lo escribe otra
herramienta (Anki, una hoja de cálculo, un editor) y llega a través del
navegador. Una sola defensa no basta.

| Barrera | Qué hace | Dónde |
|---|---|---|
| Tope de cuerpo HTTP | El original permanece en el navegador. API ≤ 256 KiB; lote preparado ≤ 128 KiB y 250 filas. Las Server Actions usan su límite predeterminado de 1 MB. | `import-transfer.ts`, `readPrivateJson`, `next.config.ts` |
| Tamaño y filas | File.size ≤ 5 MiB antes de leer, UTF-8 estricto y tokenización acotada. Hasta 10.000 filas de datos y 200 columnas, sin confundir directivas o saltos entre comillas con filas. | `browser-import.ts`, parser y límites del dominio |
| Nombre de archivo | Se queda el último segmento, se quitan controles y `..`, se recorta a 255. | `importing/domain/filename.ts` |
| HTML → texto plano | Conversión una vez al preparar el archivo: etiquetas fuera y contenido de `script`/`style`/`iframe` descartado. El protocolo transporta texto, validado nuevamente en servidor. | `sanitize.ts`, `prepare-browser-import.ts`, `import-transfer.ts` |
| React | El texto se interpola como hijos, nunca con `dangerouslySetInnerHTML`. El escape por defecto es la última red. | pantallas de importación y biblioteca |
| Longitud de campo | Frente/reverso ≤ 4.000; campo de etiquetas ≤ 2.000. Códigos `front_too_long` / `back_too_long` / `tags_too_long`. | `classifyFields` |
| Mensajes y muestras | `row_sample` sin controles, ≤ 200 caracteres. Ningún mensaje incluye la fila entera, una consulta o un secreto. | `sanitizeRowSample` |
| CHECK en la base | `original_filename` 1–255; `message` 1–500; `row_sample` ≤ 500. Último guardián si un llamador futuro se salta el dominio. | `import_jobs` / `import_job_errors` |
| Recuento al ejecutar | Descriptor, cursor y sumas se comprueban en servidor y DB. Los recibos son inmutables y consumen el payload en la transacción. | `import-transfer.ts`, migración de lotes |
| Cuota por cuenta | Reloj UTC del servidor, dos segundos entre nuevos intentos, máximo 50 intentos/100.000 filas al día; replay sin nueva cuota. | `import_rate_limits` y su guardián |

Los límites de campo del import son **propios** (feature-first): no se
importan de `library/domain/taxonomy.ts`. Al crear conceptos e ítems
(LEX-4.7) aplican además los topes más estrictos de cada entidad (título
200, etc.) con sus propios mensajes.

## HTML importado

Lexora guarda texto plano. Un export de Anki con `#html:true` suele traer
`<b>`, `<i>`, `<br>` y, en el peor caso, `<script>` o `<img onerror>`.

- Se eliminan las etiquetas y se conserva el texto (`<b>hello</b>` →
  `hello`).
- El contenido de `script`/`style`/`iframe` no se conserva (`<script>alert(1)</script>world`
  → `world`).
- Un `<` que no abre etiqueta (`3 < 5`) se deja tal cual.
- Esto corre **aunque el archivo no declare `#html:`**: la directiva no es
  una señal de confianza.

Las entidades se decodifican después de quitar etiquetas: `&lt;div&gt;` se conserva
como texto literal `<div>`. No se vuelve a limpiar ese texto preparado: React lo
escapa, como en el CRUD de conceptos. No se interpreta ningún campo como HTML activo.

## Fórmulas CSV

Al importar, un valor que empieza por `=` se guarda como texto. Al exportar se
neutralizan fórmulas incluidas las que llevan controles/caracteres invisibles
delante. Contrato y prueba real de hoja de cálculo en [DATA_EXPORT](DATA_EXPORT.md).

## Duplicados

La vista previa clasifica cada fila válida como nueva o posible duplicada
comparando la `canonical_key` del frente con los conceptos vivos del curso
(y con filas anteriores del mismo archivo). La persona elige **omitir** o
**crear copia**. No hay «actualizar coincidencia»: un título igual no basta
para saber que es el mismo concepto con un campo distinto, y un `UPDATE`
silencioso rompería la regla de no sobrescribir. LEX-4.7 ejecuta esa
elección.

## Recuperación y límites

Cada lote confirma todas sus entidades y progreso en una transacción INVOKER.
Solo un trigger privado sin EXECUTE directo actualiza los metadatos protegidos
del trabajo propio. El [ADR-010](adrs/010-bounded-import-transactions.md) explica
esta excepción acotada. No hay clave administrativa en la app.

Pausar no promete deshacer un lote ya confirmado. Continuar consulta primero el
progreso guardado; finalizar conserva sus filas. No hay cola offline ni reintentos
ocultos. Los presupuestos de navegador/API/backend son 25/15/12 s y la función de
alojamiento tiene 20 s. Las mediciones locales no garantizan tiempos de producción
ni capacidad ilimitada. Las cuotas del import no restringen todo el CRUD ordinario.
