# Seguridad de entradas no confiables

Cómo trata Lexora un archivo que alguien sube. Complementa
[`IMPORT_FORMAT.md`](IMPORT_FORMAT.md) (forma del archivo) y
[`DATA_MODEL.md`](DATA_MODEL.md) (dónde se registra el trabajo). Las reglas de
producto viven en `MASTER_SPEC.md` §16; este documento registra **cómo** se
aplican en el código, sin copiar esa especificación.

> **Alcance actual (LEX-4.5):** validación y saneamiento de la importación
> TXT/CSV. Autenticación, RLS y secretos se cubren en los ADR y en las
> evidencias de FASE 1–3. Rate limiting / cuotas de importación queda para
> una tarea posterior de FASE 4 o FASE 8.

## Por qué hay más de una barrera

Un archivo de importación es contenido **no confiable**: lo escribe otra
herramienta (Anki, una hoja de cálculo, un editor) y llega a través del
navegador. Una sola defensa no basta.

| Barrera | Qué hace | Dónde |
|---|---|---|
| Tope de cuerpo HTTP | Next.js rechaza una Server Action de más de 6 MB (el default es 1 MB; 6 deja holgura para el multipart alrededor del tope de 5 MB). | `next.config.ts` |
| Tamaño y filas **antes** de parsear | 5 MB (bytes UTF-8 / `File.size`) y 10.000 saltos de línea. Un archivo que los pase no llega a Papa Parse. | `importing/domain/limits.ts`, `inspectImportUpload`, `previewImportAction` |
| Nombre de archivo | Se queda el último segmento, se quitan controles y `..`, se recorta a 255. | `importing/domain/filename.ts` |
| HTML → texto plano | Etiquetas fuera, contenido de `script`/`style`/`iframe` descartado. Siempre, no solo con `#html:true`. | `importing/domain/sanitize.ts` |
| React | El texto se interpola como hijos, nunca con `dangerouslySetInnerHTML`. El escape por defecto es la última red. | pantallas de importación y biblioteca |
| Longitud de campo | Frente/reverso ≤ 4.000; campo de etiquetas ≤ 2.000. Códigos `front_too_long` / `back_too_long` / `tags_too_long`. | `classifyFields` |
| Mensajes y muestras | `row_sample` sin controles, ≤ 200 caracteres. Ningún mensaje incluye la fila entera, una consulta o un secreto. | `sanitizeRowSample` |
| CHECK en la base | `original_filename` 1–255; `message` 1–500; `row_sample` ≤ 500. Último guardián si un llamador futuro se salta el dominio. | `import_jobs` / `import_job_errors` |

Los límites de campo del import son **propios** (feature-first): no se
importan de `library/domain/taxonomy.ts`. Cuando LEX-4.7 cree conceptos e
ítems, esos validadores aplicarán sus topes más estrictos (título 200, etc.)
con sus propios mensajes.

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

No se introduce una librería de sanitización HTML: el objetivo no es HTML
seguro, es **dejar de tener HTML**.

## Fórmulas CSV

Neutralizar `=`, `+`, `-`, `@` al **exportar** (para que una hoja de cálculo
no interprete una celda como fórmula) no aplica aquí: esta tarea no escribe
CSV. Queda para la exportación (FASE 8). Un valor que empiece por `=` se
guarda como texto.

## Qué no cubre esto

- Cuotas o cooldowns de importación por cuenta.
- Ejecutar la importación y persistir `import_jobs` (LEX-4.7).
- Clasificación de duplicados (LEX-4.6).
