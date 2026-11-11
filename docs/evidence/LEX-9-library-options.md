# Opciones de biblioteca e importación sin truncamiento

Fecha: 2026-11-11. Rama `feat/v1-library-options`, base `154a849`.
M24 `20261111223000_library_options`, únicamente local en este checkpoint.
Contrato: [lecturas acotadas](../LIBRARY_PAGINATION.md).

## Comportamiento

El detalle de concepto muestra páginas independientes de veinte etiquetas e
ítems, con recuentos completos. La tarjeta de la lista muestra tres etiquetas
y un enlace al resto. Editar e invertir consulta directamente el ítem por ID,
concepto y dueño, también después del número mil. Las mutaciones conservan las
páginas; las altas de ítems en listas largas muestran la última página y confirman
el guardado. Las vueltas se construyen en la misma ruta local con parámetros
numéricos normalizados.

La importación busca y pagina veinte mazos, conservando la selección fuera de
los resultados y el archivo en memoria. La búsqueda no envía el formulario del
wizard. El primer mapeo respeta la directiva de columna de etiquetas, incluso
después de la tercera; al cambiar de archivo se descarta el mapeo anterior.

## Comprobaciones locales

- Integración real: seis casos PASS en el archivo de biblioteca. El nuevo usa
  1.010 etiquetas/ítems/mazos. Verifica páginas posteriores a mil, totales,
  preview de tres etiquetas, selección fijada, lectura/inversa del último ítem,
  rechazo de concepto incorrecto/no-dueño/anon y máximo de veinte IDs por preview.
- Pase dirigido de aplicación, query, parser e integración: 32 PASS.
- pgTAP: 592 PASS en 25 archivos. Las nueve nuevas cubren privilegios,
  INVOKER y ausencia de identidad. Replay: 24 migraciones reales y quince
  aserciones PASS, sin seed, en base desechable eliminada al terminar.
- Primer navegador: 48 PASS y cuatro fallos del localizador nuevo (opción y
  recap compartían texto). Se acotó al recap exacto. Pase final: dieciséis PASS,
  ES/EN, escritorio y móvil, sin retries, exit 0. Cubre editar/invertir el último
  ítem, páginas conservadas, texto al 200 %, directiva tags en primera columna,
  selección posterior al mazo mil e importación al destino confirmado.
- Gate general final con integración habilitada: 921 PASS y una omisión
  prevista; formato/lint/tipos/contraste/build PASS, exit 0.

Los datos de integración son sintéticos y locales. La limpieza identifica las
cuentas propias por UUID y correo reservado; el E2E limpia su curso propio.
La suite usa por defecto el puerto 3100 para reservar el 3000 a otros proyectos.

## Revisión independiente

Tres lentes estáticas cerradas: corrección, seguridad y estándares. Se corrigió
la lectura parcial en editar/invertir, el límite de la directiva de columna y
la pérdida de contexto tras mutaciones. No se declara que los revisores hayan
ejecutado suites. Las RPC permanecen INVOKER/RLS, search_path vacío, EXECUTE
solo authenticated y DTO limitado; los fallos públicos no exponen al proveedor.

## Publicación

La primera CI43112610621 falló en una prueba existente de Today: comparaba dos
selecciones sin ORDER BY y truncadas a mil logs de un fixture mayor. El diff
mostró un ID desplazado del principio al final, no una escritura acreditada.
Se corrigió la prueba para comparar todos los IDs, ordenados y paginados de
quinientos en quinientos, con aserción explícita de más de mil. No se modifica
el código de estudio ni se oculta la comprobación de ausencia de escrituras.

Snapshot de 646 archivos publicables (3,14 MB): Gitleaks 8.30.1 sin hallazgos,
exit 0. No incluye archivos ignorados. Diff revisado y sin errores de whitespace.
Publicación verificada: PR #110, head `f2ca8c4`, CI43113580150 con los tres
trabajos SUCCESS. Navegador184 PASS+4 omisiones, cerrado4 y Preview4. Merge
`3d795f77f79ce00c149dcdead3ae1aae63b51ead`, deployment7723171106 Production SUCCESS.
La migración M24 se aplicó desde ese snapshot exacto; dry-run posterior limpio.
Metadata remota: veinticuatro migraciones, tres funciones nuevas INVOKER y
EXECUTE anónimo denegado. Health200 app/database true; login200, CSP distinto
por respuesta y no-store/DENY conservados. Ningún reset ni seed remoto.
