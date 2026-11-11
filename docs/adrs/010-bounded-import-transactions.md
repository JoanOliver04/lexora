# ADR-010: importación acotada con recibos y progreso protegido

- Estado: aceptado, 2026-11-11.
- Contexto: la importación anterior escribía cada entidad por separado y buscaba
  duplicados mediante un listado limitado por PostgREST. Los archivos admitidos
  de 5 MB también pueden superar el límite de una petición de alojamiento al
  serializarse completos. Se conserva el alcance personal de ADR-008.

## Decisión

El navegador lee UTF-8, calcula SHA-256 de los bytes originales y tokeniza el
archivo sin subirlo. Aplica el mapeo y convierte HTML a texto una sola vez.
Los campos del protocolo son texto plano, como los del CRUD de conceptos:
el servidor valida nuevamente las reglas de dominio y React los muestra
escapados. Repetir la conversión de HTML dañaría entidades que representan
etiquetas literales. Ningún campo se inserta como HTML.

La preparación cede el hilo entre grupos de 50 filas y limita la muestra visible.
Se admiten 5 MiB, 10.000 filas de datos y hasta 200 columnas para acotar el selector
de mapeo. El recuento exacto se realiza después de las directivas y respeta CSV
multilínea. Cada envío contiene hasta 250 filas y 128 KiB de JSON preparado;
la API limita el cuerpo a 256 KiB. Las consultas de duplicados utilizan la clave
canónica calculada en PostgreSQL y el índice del curso completo.

Cada lote es una transacción SECURITY INVOKER bajo las políticas RLS del usuario.
Escribe conceptos, ítems, relaciones, errores y un recibo inmutable. El recibo
conserva hash y contadores derivados, nunca su payload. Repetir el mismo lote
devuelve el progreso confirmado; cambiar su contenido o posición genera conflicto.
Solo puede existir un intento activo por propietario y curso. El descriptor
original permite recuperar ese intento desde otro dispositivo sin crear copias.

Un trigger privado SECURITY DEFINER, sin EXECUTE para clientes y vinculado a la
tabla de recibos, actualiza únicamente los metadatos protegidos del trabajo propio.
Comprueba tabla, operación, auth.uid(), estado y posición. No escribe contenido
de aprendizaje ni Auth, no recibe argumentos y fija search_path vacío. Esta es
una excepción acotada al uso de INVOKER; evita conceder al cliente permiso para
fabricar progreso. El trigger BEFORE de recibos sigue siendo INVOKER y calcula
todos los contadores dentro de la misma transacción. No hay clave administrativa
en la aplicación. Las filas históricas sin fingerprint conservan su contrato.

El guardián de cuotas deriva reloj UTC, fecha y contadores en el servidor: dos
segundos entre intentos nuevos, hasta 50 intentos y 100.000 filas declaradas al
día. Un replay del descriptor no consume otra cuota. Es un límite del flujo de
importación, no una cuota global sobre la edición ordinaria del propietario.

## Recuperación y adopción

Una respuesta perdida detiene los envíos. Continuar consulta primero el progreso
persistido y envía solo lo pendiente, incluso con la estrategia de copia. Pausar
no promete deshacer una petición que ya pudiera haberse confirmado. Finalizar un
intento conserva sus filas confirmadas. No hay reintento oculto ni cola offline.
Al recargar, el navegador requiere volver a seleccionar el archivo original;
solo el identificador del trabajo permanece en la URL, sin archivo en Storage
ni datos de aprendizaje en localStorage.

Los presupuestos de navegador/API/backend son 25/15/12 segundos, con función de
alojamiento limitada a 20 segundos y transacciones pequeñas. La cancelación
alcanza el transporte de Auth y de datos; no se presenta como prueba de rollback
si el servidor ya confirmó la transacción.

La migración es aditiva y debe aplicarse antes del cliente que llama a las RPC.
Retirar la interfaz no pierde el contenido ya importado. Los metadatos y recibos
se conservan para resolver reintentos y siguen la eliminación propia de cuenta.
No se aplican limpiezas de contenido histórico ni restauraciones en producción.

## Verificación

Pruebas con Supabase local y propietarios sintéticos cubren aislamiento,
concurrencia de dos peticiones, replay, rollback después de escribir contenido,
errores Unicode y duplicados posteriores al concepto 1.000. Los gates y medidas
de rendimiento ejecutados se registran en la evidencia de la entrega. Las pruebas
del navegador deben acreditar el transporte fragmentado y la recuperación de una
respuesta perdida. No se deduce capacidad ilimitada de estas mediciones.
