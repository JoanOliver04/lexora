# ADR-008: entrega para uso personal

- Estado: aceptado por instrucción expresa de Joan, 2026-11-11.
- Contexto: la entrega actual se destina únicamente a su propietario. No quiere
  publicar correo de contacto ni configurar un proveedor de correo nuevo.

## Decisión

La prioridad es completar una aplicación personal segura y recuperable:
estudio, biblioteca, importación, preferencias, datos propios e instalación.
No se contratan servicios, no se habilita captación de usuarios y no se publica
un correo de contacto. La política pública comercial, SMTP dedicado, demo de
captación y publicación en portfolio quedan fuera de esta entrega personal.
La información técnica de proveedores, conservación, exportación y recuperación
sigue siendo necesaria para operar y cuidar los datos.

El registro público debe cerrarse tanto en la aplicación como en Supabase Auth.
No basta con ocultar un enlace. La cuenta existente mantiene login y recuperación;
no se borran cuentas ni datos reales para limitar el acceso. El entorno local
conserva altas sintéticas para verificar aislamiento A/B y flujos de identidad.

No se incorpora Sentry como condición de entrega: los errores controlados y
checks existentes siguen dando observabilidad sin añadir otro proveedor.
Una apertura a terceros exigirá revisar de nuevo registro, correo, privacidad,
presupuesto y aceptación; este ADR no los declara resueltos para un uso público.

## Consecuencias

La validación de seguridad y datos sigue siendo obligatoria. Los pendientes
exclusivos de lanzamiento público se documentan como fuera del alcance actual,
sin presentarlos como implementados. Las comprobaciones físicas aún no realizadas
conservan su estado y no se sustituyen por emulación.

En el cierre personal, la evidencia de estabilización es acotada a los gates,
los despliegues comprobados y los informes recibidos. No se inventa un periodo
de observación acordado ni un SLA. La versión personal1.0.0 puede entregarse sin
declarar cerrado el hito de lanzamiento público, marca/licencia o portfolio.
