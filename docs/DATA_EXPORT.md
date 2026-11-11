# Exportación de datos propios

La pantalla de ajustes permite solicitar JSON o CSV. La descarga es explícita,
sin cifrar y se ofrece solo cuando el navegador ha recibido y verificado todo
el archivo. Un fallo, cancelación o discrepancia de bytes/hash no crea un enlace
de descarga. No se sube una copia a un proveedor nuevo ni se guarda un snapshot
temporal en la base de datos.

## Lectura y permisos

`export_account_data()` es SECURITY INVOKER, fija `search_path` vacío y UTC, deriva
`auth.uid()` y pasa por las políticas RLS de cada tabla. No acepta un propietario
desde el cliente. Incluye perfil, cursos/ajustes, catálogo de idiomas referenciado,
biblioteca/relaciones/etiquetas, estados, review logs, sesiones e importaciones con
sus errores. Incluye contenido archivado. No consulta Auth ni exporta contraseñas,
tokens, claves, otras cuentas o el ledger técnico de cooldown.

Una única SELECT forma la lectura coherente de las quince entidades. Una CTE
acotada comprueba 50.000 registros y 16 MiB de datos antes de agregar el resultado.
Superar un límite rechaza el conjunto entero: no se exportan solo las primeras
filas. No se reescribe contenido, historial o estado FSRS.

`account_export_requests` almacena solo el último instante de solicitud por cuenta.
RLS y privilegios impiden leer otra cuenta o eliminar el ledger. Un trigger toma
el lock del perfil, estampa la hora del servidor y exige 60 segundos entre updates.
No se puede saltar el límite enviando una fecha anterior ni con dos solicitudes
simultáneas. Un rechazo por tamaño también conserva el cooldown. Esta fila se
elimina por cascada al eliminar el perfil; no contiene una copia del contenido.

## Transporte

POST `/api/account/export` exige Origin igual al dominio configurado, JSON de
máximo 128 bytes y un objeto estricto con `format: json | csv`. Requiere sesión
verificada. Errores estables: 400, 401, 403, 413, 415, 429 con Retry-After y 503;
sin consultas, datos privados o errores crudos en la respuesta.

El resultado se entrega con ReadableStream y backpressure, attachment, nosniff y
`private, no-store, no-transform`. Cada chunk conserva caracteres Unicode completos.
El límite de archivo es 64 MiB, calculado antes de enviarlo; cada chunk es acotado.
El navegador comprueba el número de bytes y SHA-256 indicado en cabeceras antes
de crear el Blob descargable y libera su URL posteriormente. La comprobación es
de integridad, no una firma. TLS y la sesión protegen el transporte y la identidad.

El streaming evita formar una respuesta buffered superior al límite de la
[función de Vercel](https://vercel.com/docs/functions/limitations), conforme a su
[guía de respuestas grandes](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
La prueba local descarga más de 5 MiB; no se han exportado datos reales de producción
para probar esta función.

## Formatos

JSON es UTF-8 sin BOM, con envelope `format`, `formatVersion`, `schemaVersion`,
`appVersion`, `exportedAtUtc`, `payloadSha256` y `payload`. La versión de formato y
la del contrato de datos son independientes de los timestamps de migración.
Conserva IDs, enums, números, null y vacío, texto literal y relaciones. Los instantes
UTC de columnas se normalizan a Z conservando microsegundos; no se modifica JSONB
de contenido arbitrario. Las filas tienen orden determinista y el checksum cubre
los bytes exactos del payload serializado.

El RPC entrega el payload como texto opaco para que el SDK no convierta sus
números a IEEE-754 antes de validarlo. Node 24 conserva los lexemas con
`JSON.parse` y `context.source`/`JSON.rawJSON`. Se comprueba la estructura y el
recuento sin clonar el contenido con Zod; así se mantienen claves propias como
`__proto__` y no se pierde precisión en enteros o decimales. Un objeto de contenido
con una clave `rawJSON` sigue siendo un objeto ordinario. Faltando estas APIs del
runtime, se rechaza la operación en lugar de redondear silenciosamente.

CSV es UTF-8 con BOM para hojas de cálculo, CRLF, columnas fijas y escape de Papa
Parse con comillas. Cada fila tiene entidad, campos comunes y `raw_json` completo.
No es un formato de restauración. Se neutralizan fórmulas al principio de una celda,
incluidas precedidas por espacios, controles y marcas invisibles; también tab/CR/LF
iniciales. El escape de fórmulas es independiente del escape de delimitadores,
comillas y saltos de línea. Se comprueba con un parser real y fixtures hostiles,
siguiendo [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection).

Estos archivos son exportaciones de datos de aplicación. No incluyen usuarios,
sesiones o configuración de Auth, y la app no ofrece restauración automática de
este formato. El backup y la recuperación operativa del proyecto son otra operación;
no se presenta el CSV como copia exacta ni se promete restaurarlo.
