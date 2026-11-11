# ADR-009: eliminación propia de Auth con privilegio acotado

- Estado: aceptado, 2026-11-11.
- Contexto: borrar solo el perfil no elimina la identidad de Auth. La app debe
  ofrecer eliminación completa sin añadir una clave administrativa al servidor.

## Decisión

Una RPC pública SECURITY INVOKER llama a una única función privada SECURITY
DEFINER. Esta es una excepción deliberada al uso ordinario de INVOKER: necesita
eliminar exclusivamente la fila de `auth.users` identificada por `auth.uid()`.
No admite un ID de propietario ni SQL dinámico. Fija `search_path` vacío y nombres
de esquema explícitos; solo `authenticated` puede ejecutarla. No se concede
DELETE sobre Auth ni CREATE en el esquema privado a clientes.

Exige confirmación literal, correo propio y una sesión de Auth existente, del
mismo usuario, no vencida y creada hace menos de cinco minutos. No usa el `iat`
de un token renovado como prueba de reautenticación. Con un factor verificado
exige `aal2`. El flujo web verifica la contraseña otra vez y, si corresponde,
un código TOTP antes de llamar a la RPC. Otros métodos MFA no se omiten.

Auth y todos los datos de aplicación se eliminan en una transacción mediante
las FK existentes. Una repetición con un JWT firmado de la identidad ya borrada
devuelve éxito sin tocar ninguna otra identidad. Los JWT antiguos no recuperan
el perfil: la FK hacia Auth rechaza su recreación y el layout termina en login.

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

Retirar la interfaz y las dos funciones revierte la capacidad. Una eliminación
confirmada por el propietario es irreversible desde la app; no se presenta la
exportación JSON/CSV como restauración completa de Auth. Backups y logs de los
proveedores siguen su política independiente. No se borran cuentas reales para
probar el despliegue ni se implanta una purga automática de contenido.
