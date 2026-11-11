# Conservación y eliminación en la entrega personal

Lexora se utiliza de forma personal y mantiene cerrado el registro público
(ADR-008). Esta información operativa no es una política de captación de usuarios
ni publica un contacto. Los proveedores actuales son Supabase (Auth y PostgreSQL)
y Vercel (ejecución y alojamiento). No hay proveedor de IA, analítica de contenido,
SMTP nuevo ni Sentry incorporado para esta entrega.

## Qué se conserva

El perfil, las preferencias, los cursos, el contenido y sus relaciones se conservan
hasta que su propietario los modifica o elimina la cuenta. Mazos, conceptos e ítems
se archivan para preservar las relaciones: archivar no elimina sus datos ni el
historial. Estados, sesiones y eventos de repaso se conservan durante la vida de la
cuenta. Los eventos son append-only en el uso normal; eliminar la cuenta elimina
también esos eventos.

Las importaciones conservan su configuración, hash, contadores y diagnósticos
acotados para poder revisar el resultado. No guardan el archivo original. Los
diagnósticos pueden incluir una muestra de fila de hasta 500 caracteres: son datos
privados del propietario, no telemetría pública. Se conservan durante la vida de
la cuenta y se eliminan con ella. No hay una purga silenciosa de importaciones
antiguas ni una tarea cron de pago; cualquier futura caducidad requerirá política,
migración y prueba propias. El archivo de entrada y el preview viven en el
navegador y se liberan al abandonar el asistente; no se crea una copia en Storage.

Una exportación no crea snapshots en el servidor. El ledger de cuota conserva solo
la última fecha por cuenta. El Blob de descarga se libera después de ofrecerlo;
la copia que se guarda en el dispositivo queda bajo control del propietario y
no se borra al eliminar la cuenta. Véase [DATA_EXPORT](DATA_EXPORT.md).

## Eliminación solicitada

El borrado desde ajustes requiere confirmación explícita y volver a autenticar con
la contraseña. Se elimina la identidad de Auth y, por cascada, todos los datos de
aplicación de esa identidad en una única transacción. Un fallo revierte el conjunto.
No se acepta un ID de propietario enviado por el navegador y no se añade una clave
administrativa al entorno de la app. El registro sigue cerrado: borrar la cuenta
personal no habilita crear otra desde la web.

Antes de borrar, se recomienda descargar los datos que se quieran conservar. Esa
exportación no es un backup completo de Auth ni tiene restauración automática.
La comprobación destructiva se realiza exclusivamente sobre cuentas sintéticas
locales, tras exportar y comprobar su contenido. No autoriza borrar la cuenta real.

Un JWT ya emitido puede seguir siendo criptográficamente válido hasta caducar;
el borrado elimina sus sesiones y su perfil, y las FK/RLS impiden reconstruir o
leer contenido de la cuenta. La operación sensible comprueba además la sesión
actual de Auth, su antigüedad y el nivel MFA cuando corresponda.

## Límites del borrado

El borrado transaccional afecta a las bases activas de Auth y de la aplicación.
Los backups y los logs técnicos de los proveedores siguen sus propias políticas
y no se presentan como borrados instantáneamente por esta acción. No se envían
contraseñas, prompts, respuestas ni exportaciones a logs de aplicación. No se
promete un RPO/RTO ni retención del plan que no se haya comprobado.
