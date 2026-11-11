# Ciclo de datos y eliminación de cuenta

Fecha: 2026-11-11. Rama `feat/v1-account-lifecycle`, base de exportación publicada
en PR #104. Migración nueva `20261111163306_self_account_deletion.sql`, aplicada
en producción tras CI. PR #105, commit `4fdde24`, CI 43066684124 con tres SUCCESS,
merge `0a98f32`, deployment 7716863603 SUCCESS. Migración desde snapshot exacto;
dry-run posterior limpio, 21 migraciones. Health 200 app/database true; endpoint
de borrado sin sesión devuelve 401. No se invocó el borrado de una cuenta real.

## Comportamiento

Ajustes ofrece información ES/EN sobre proveedores, conservación, exportaciones,
archivado y límites de borrado. La entrega es personal, sin contacto público,
SMTP nuevo ni servicios contratados. La política conserva datos y diagnósticos
privados durante la vida de la cuenta, sin almacenar el archivo original ni
ejecutar purgas silenciosas sobre datos existentes.

El borrado exige correo propio, contraseña de nuevo, literal DELETE y aceptación.
Con TOTP permite elegir entre los autenticadores propios verificados. Los métodos
no admitidos y una carga fallida de factores mantienen el borrado desactivado;
no se omite MFA. Los secretos se limpian tras la respuesta o el fallo de transporte.
Un fallo de transporte comunica resultado incierto, pues podría seguir al commit.

RPC pública INVOKER / función privada DEFINER de alcance exclusivo `auth.uid()`:
sesión real de Auth propia, reciente, no vencida, MFA `aal2` si corresponde,
search_path vacío, sin ID de propietario ni SQL dinámico. Auth y datos de app se
eliminan por cascada en una transacción; reintento después del commit idempotente.
Sin clave administrativa. Tokens antiguos no pueden recrear el perfil.

## Evidencia ejecutada

- pgTAP: 22 archivos, 538 aserciones PASS, incluidas 22 de este bloque: privilegios,
  confirmación, sesión ausente/antigua/vencida/ajena, MFA, rollback forzado,
  idempotencia, Auth/sesiones/perfil borrados y otro propietario conservado.
- Desde base desechable sin seed: 21 migraciones, 15 aserciones PASS.
- Integración con Auth y PostgreSQL locales: 3 PASS. Exportación e integridad
  previas; quince entidades, archivados, estados, review log, importación y error;
  borrado completo, B intacto, JWT antiguo rechazado al recrear perfil, login
  eliminado rechazado. Dos TOTP reales, ID ajeno rechazado y segundo factor
  seleccionado con éxito. Se espera un paso temporal nuevo porque Auth impide
  reutilizar el código empleado al enrolar; no se falsifica su reloj.
- Unidad de formulario/caso de uso/HTTP: 8 PASS. Selector de segundo factor,
  limpieza de contraseña/OTP, bloqueo de carga fallida, validación antes de Auth,
  origen/tamaño/media type y códigos estables sin errores del proveedor.
- Gate general final: 846 PASS + 1 omitida; tipos, lint, contraste y build PASS.
- E2E dirigido final: 4 PASS sin reintentos, ES/EN y móvil/escritorio. Incluye
  información de datos y formulario abierto a 320 px/200 %, export previo,
  contraseña incorrecta, borrado, pestaña antigua y login posterior rechazado.
- E2E completo: 142 PASS + 4 omisiones condicionales existentes para material
  privado, cero reintentos, un worker. Build de registro cerrado: 4 PASS.
  Los tres checks de CI 43066684124 terminaron SUCCESS antes del merge.
- Preflight de producción de solo metadatos: la función migrada existente es de
  `postgres`; ese rol tiene SELECT/DELETE sobre Auth users, lectura de sesiones y
  factores y BYPASSRLS. No se leyeron filas de cuentas ni se invocó el borrado.

La primera prueba de layout encontró overflow en el texto/botón de borrado a
320 px/200 %; se corrigió con ajuste de palabras y ancho acotado. Se amplió también
la matriz a la página de datos. Algunas pasadas con dos workers no llegaron a crear
las fixtures: Auth local devolvió 504 en signup (10,8–10,9 s), no 429. Se ejecuta
la pasada final con un worker, sin reintentos ni omisión de casos. El test espera
ahora la respuesta del POST y exige HTTP 200 antes de comprobar la navegación;
el flujo nuevo tiene 60 s para exportación, layout, Auth y contexto antiguo.

Revisión independiente estática de tres lentes sobre 31 archivos y ampliación:
un P2 sobre selección del primer TOTP quedó corregido y re-revisado. Sin otros
hallazgos accionables comunicados. La revisión no sustituye los gates ejecutados.

No se ha borrado ninguna cuenta real ni se ha enviado contenido privado al repo.
No acredita dispositivo físico, lector real, zoom nativo ni restauración de Auth
a partir del JSON exportado. Políticas y arquitectura: [DATA_LIFECYCLE](../DATA_LIFECYCLE.md)
y [ADR-009](../adrs/009-self-account-deletion.md).
