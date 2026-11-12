# Conservación de borradores de biblioteca

Fecha: 2026-11-12. Base `6b8f31b`; rama `fix/lex-3-13-form-recovery`.
Sin migración, dependencia ni cambio de reglas de negocio.

## Problema reproducido

Las Server Actions resueltas sin navegar reinician formularios no controlados.
Con el código anterior, las dos regresiones fallaron por pérdida real de datos:
la descripción del mazo quedó vacía y el resumen editado del concepto volvió al
valor persistido anterior. La primera pasada del segundo caso tenía además una
carrera de navegación en el test; se añadió la espera del valor del detalle y
se reprodujo después la pérdida del resumen, sin confundir ambos fallos.

## Corrección y comprobación

Los estados de error devuelven solo los campos de texto del formulario. Alta y
edición los reutilizan como valores iniciales. Los selects se reconstruyen al
cambiar el valor recibido para actualizar su defaultSelected: modificar solo
defaultValue no basta para el reset nativo. Los controles se deshabilitan dentro
de un fieldset mientras se resuelve el envío, evitando escribir un nuevo borrador
que una respuesta anterior pueda resetear. Se conserva el foco de error y el
botón muestra su estado pendiente.

Resultado: cuatro E2E PASS en Chromium escritorio y perfil móvil, sin retries;
creación/edición de mazos, conceptos, ítems cloze y etiquetas, errores repetidos,
selecciones y reenvío correcto. Dos E2E adicionales PASS retienen deliberadamente
la petición y verifican controles bloqueados, reactivación, texto y foco.

La primera corrección parcial perdió las selecciones y la siguiente descubrió
la carrera con un envío pendiente. Se corrigieron ambas; no se quitaron las
aserciones de selección ni se reemplazaron por esperas temporales arbitrarias.

Gate general final con integración local: 921 PASS + 1 omisión, Node: 12 PASS;
formato, lint, tipos, contraste y build de producción PASS/exit0. Revisión
completa del diff y dependencias directas cerrada, sin hallazgos pendientes.
Pendiente CI de publicación. La aceptación física registrada en este bloque
procede del propietario y no se deduce de estos E2E.
