# Protección del acceso personal y operaciones costosas

El alcance vigente es [uso personal](adrs/008-personal-use.md). La app no permite
registro público y el backend Auth también lo rechaza. El 2026-11-12 se consultó
su configuración pública mediante la clave publishable: HTTP200,
`disable_signup:true`, `mailer_autoconfirm:false`; no se intentó crear una cuenta
real, adivinar contraseñas ni provocar bloqueos del propietario.

Auth gestiona los límites de sus endpoints. Se revisó la [documentación oficial
de límites](https://supabase.com/docs/guides/auth/rate-limits), actualizada por el
proveedor el 2026-10-26. Describe cuotas por IP/operación, ventanas por usuario
para mensajes y respuesta429. Esos valores documentados no se presentan como
una lectura de la configuración protegida del Management API del proyecto.
No se modifica Auth ni se añade CAPTCHA, SMTP, Redis o un plan de pago.

| Operación | Barrera aplicada | Evidencia ejecutable |
|---|---|---|
| Nuevo acceso | Registro denegado en app y Auth; login existente conservado | `personal-access.spec.ts`, consulta pública indicada arriba |
| Importación | Dueño desde sesión/RLS, 2s entre intentos, 50 intentos y100.000 filas por día UTC; replays no cobran de nuevo | `220-batched-import.sql`, integración de import-transfer y E2E de recuperación |
| Exportación | Una solicitud por cuenta cada60s, lock del perfil y reloj del servidor; cliente no puede backdatear/eliminar el ledger | `200-data-export.sql`, integración de exportación |
| Repaso | Idempotencia y revisión esperada; estado y log en una transacción; conflicto no produce otro guardado | Tests SQL de commit, integración y `study-recovery.spec.ts` |
| Borrado | La app exige contraseña y confirmación; RPC solo autenticada, limitada al UID propio, sesión Auth viva de hasta5min, correo/DELETE y AAL2 si hay MFA; sin DELETE directo sobre tablas Auth | `210-self-account-deletion.sql`, E2E con cuentas sintéticas locales |

Los límites de cuerpo, tiempo, lote y resultado están en [SECURITY](SECURITY.md),
[exportación](DATA_EXPORT.md) y [ADR-010](adrs/010-bounded-import-transactions.md).
Los contadores duraderos usan UTC del servidor y no un mapa de memoria que se
pierda entre funciones. No se abre una excepción de RLS para saltar cuotas.

No hay una regla WAF personalizada contratada ni se atribuye protección ilimitada
al proveedor. La protección de contraseñas filtradas figura como aviso del plan
alojado y no se activa cambiando a un plan de pago. La auditoría de dependencias
del 12/11 terminó con todas las severidades en0. Los tests de abuso no usan datos
ni cuentas reales de producción.
