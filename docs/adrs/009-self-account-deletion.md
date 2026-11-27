# ADR-009: eliminación propia de Auth con privilegio acotado

- Estado: aceptado, 2026-11-11.
- Contexto: borrar solo el perfil no elimina la identidad de Auth. La app debe
  ofrecer eliminación completa sin añadir una clave administrativa al servidor.

## Decisión

Las RPC de borrado se ejecutan como SECURITY INVOKER y delegan las operaciones
privilegiadas en funciones privadas con `search_path` vacío. Obtienen el
propietario de `auth.uid()`. La aplicación utiliza la sesión de la propia cuenta
para acceder a Storage.

La confirmación exige el correo propio, la palabra `DELETE` y una sesión de Auth
vigente creada en los últimos cinco minutos. Una cuenta con contraseña vuelve a
introducirla. Para Google, la app abre el selector del proveedor con PKCE y
vincula un desafío de un solo uso al propietario y a su sesión inicial. El
retorno debe aportar la cookie del desafío, el mismo propietario y una sesión
OAuth nueva. Cuando hay un factor verificado, la interfaz pide TOTP y la base
de datos exige `aal2` al confirmar.

La confirmación registra la operación y elimina el perfil y sus datos
relacionados en una transacción. Un bloqueo del curso coordina las subidas
concurrentes. Si ya no hay objetos físicos, se elimina también la identidad de
Auth. Si quedan audios, el propietario puede usar la identidad para terminar
la limpieza. Un trigger impide recrear su perfil mientras tanto.

La API de Storage retira los objetos en lotes. Cada reintento consulta los
objetos restantes. La pantalla de cuenta pendiente permite reanudar el borrado
después de cerrar el navegador o iniciar una nueva sesión. La última fase
confirma que el prefijo del propietario está vacío y elimina su identidad y el
registro pendiente. La FK hacia Auth sigue impidiendo que un JWT antiguo
recree el perfil de una cuenta eliminada.

## Alternativas

- Admin API con clave privilegiada: añade un secreto con alcance sobre todas las
  cuentas y divide Auth/app en operaciones que necesitan reconciliación.
- Borrar solo las tablas públicas: deja la cuenta de Auth y permite recrear el
  perfil; no cumple la eliminación completa.
- Exponer DELETE sobre Auth con RLS de aplicación: Auth es una superficie
  administrada; sus permisos no se amplían a clientes de la aplicación.

## Adopción y reversibilidad

La migración es aditiva y se aplica antes del código que la invoca. No elimina
ninguna cuenta al desplegar. La prueba destructiva utiliza solo identidades
sintéticas locales y comprueba primero una exportación. Se valida el rollback
ante un fallo de cascada, el aislamiento A/B, sesiones antiguas/ajenas/vencidas,
MFA y una pestaña con token anterior al borrado.

La comprobación local incluye una interrupción después de retirar el primer
audio, la reanudación desde una sesión nueva y el cierre de Auth. Las pruebas
de Google comprueban el desafío, la caducidad y el segundo factor con
identidades sintéticas. Los registros técnicos y las copias de los proveedores
siguen sus propios plazos de conservación.
