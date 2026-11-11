# Lecturas acotadas de biblioteca

El detalle de un mazo consulta una instantánea de PostgreSQL con su metadata,
recuento completo, una página de conceptos vinculados y otra de candidatos.
La interfaz muestra veinte entradas por lista. Sus búsquedas y páginas son
independientes y se conservan al vincular o desvincular un concepto.

`read_library_deck_detail` admite como máximo cien entradas por página y
doscientos caracteres por búsqueda. Reajusta una página obsoleta a la última
disponible. Devuelve solo ID y título de cada opción, sin descargar el cuerpo
de todos los conceptos. Ordena por posición/fecha/ID los miembros y por
título/ID los candidatos. Un mazo archivado sigue siendo legible para restaurarlo;
los conceptos archivados quedan fuera de las listas y del recuento activo.

`count_library_deck_concepts` agrega en SQL hasta cien IDs de mazo. El adaptador
de aplicación divide selecciones mayores en grupos de cien. El resultado no
depende del límite de mil filas de PostgREST e incluye los mazos vacíos propios.

`attach_library_tag` busca, crea si procede y asocia la etiqueta en una sola
transacción. Una carrera sobre el nombre normalizado reutiliza el mismo ID;
un fallo posterior revierte también la creación. Se conserva la grafía visible
de la etiqueta existente. No se consulta todo el catálogo para resolver un nombre.

Las tres funciones son `SECURITY INVOKER`, tienen `search_path` vacío y solo
conceden EXECUTE a `authenticated`. Comprueban el contexto de dueño además de
las políticas RLS existentes. La lectura y la asociación verifican curso/objeto;
no se introduce una restricción global nueva de pertenencia al mismo curso en
las tablas de relaciones históricas. El adaptador valida el DTO, la identidad
solicitada y la coherencia de sus contadores; usa un plazo de doce segundos y
errores públicos depurados.

La vuelta después de una mutación admite exclusivamente cuatro parámetros de
consulta normalizados y una ruta local construida con UUID. Su presupuesto de
4.096 caracteres admite ambas búsquedas Unicode codificadas. No acepta destinos
arbitrarios. Las páginas con formularios GET funcionan sin estado cliente y los
navegadores conservan sus controles de navegación y búsqueda nativos.

## Opciones de conceptos e importación

La siguiente migración local añade `read_library_concept_options` (veinte
etiquetas e ítems por página), `read_library_tag_previews` (tres etiquetas y su
total exacto para hasta veinte conceptos) y `read_library_deck_options` (veinte
mazos con búsqueda y selección fijada). Mantienen INVOKER, RLS y EXECUTE solo
para authenticated. Los DTO rechazan páginas incoherentes. Las lecturas tienen
un plazo de doce segundos y orden estable con ID como desempate.

La lista de conceptos enlaza al detalle para ver las etiquetas restantes. Editar
o invertir un ítem lo consulta por ID, concepto y dueño; no depende de buscarlo
en una lista parcial. Las mutaciones conservan ambas páginas y las altas de
ítems en listas largas llevan a la última página con confirmación. La navegación
de vuelta se limita al mismo concepto y dos parámetros numéricos normalizados.

El selector de importación conserva el mazo elegido aunque quede fuera de los
resultados buscados. Sus controles no envían el formulario del wizard ni
remontan su estado; el archivo sigue en memoria. Las acciones de búsqueda
resuelven curso y dueño en servidor y devuelven fallos genéricos.

El mapeo inicial usa `#tags column` dentro del ancho real del archivo y toma
las primeras dos columnas restantes para frente/reverso. Al sustituir el archivo
se descartan los selectores del archivo anterior; después se respeta el mapeo
elegido por la persona. Reanudar un trabajo conserva su mapeo persistido.
