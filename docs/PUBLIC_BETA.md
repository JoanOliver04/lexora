# Beta web pública de Lexora

Lexora se prepara para recibir cuentas nuevas por correo y Google como beta
gratuita de JVOR Studios. El registro alojado todavía está cerrado. La
aplicación web es la primera entrega. React Native, Play Store, App Store,
suscripciones y anuncios pertenecen a una fase posterior.

## Antes de abrir

1. Configurar un remitente dedicado y un proveedor SMTP en Supabase Auth para
   confirmaciones y recuperación. El correo predeterminado de Supabase se
   limita a miembros del equipo. Mantener habilitada la confirmación del correo
   y aplicar también en Auth el mínimo de contraseña de la aplicación.
   [Correo de Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
2. Completar el aviso de privacidad de `/es/privacy` y `/en/privacy` con el
   responsable y un canal operativo para sus solicitudes. Vercel lee
   `LEXORA_PRIVACY_CONTROLLER` y `LEXORA_PRIVACY_CONTACT`. El canal acepta una
   dirección autorizada o un formulario HTTPS. Si se añade un proveedor de
   correo, reflejarlo en el aviso junto con los datos de conservación y
   transferencias que correspondan al servicio contratado.
   [Deber de informar según la AEPD](https://www.aepd.es/guias/guia-modelo-clausula-informativa.pdf)
3. Revisar el proyecto External en Google Auth Platform y los retornos en
   Supabase. El cliente usa solo `openid email profile`. Preparar la publicación
   de la marca, el canal de soporte autorizado y la URL de privacidad, y
   comprobar el consentimiento con una cuenta externa al proyecto.
   [Estados OAuth de Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

Las credenciales de Google y SMTP se introducen directamente en sus paneles.
La allowlist de Supabase debe aceptar el callback de producción de Lexora
`https://lexora-one-alpha.vercel.app/api/auth/callback` con sus parámetros de
idioma, flujo y destino interno. El retorno de Google a Supabase conserva la
URL que muestra el proveedor en su configuración.

## Activación y aceptación

- Verificar la entrega de confirmaciones y recuperación a una cuenta de prueba
  ajena al equipo de Supabase. Confirmar en el mismo navegador que inició el
  alta y completar el primer curso vacío.
- Aplicar `LEXORA_ALLOW_REGISTRATION=true` en Vercel Production con el responsable
  y el contacto configurados. Activar las altas en Supabase Auth al abrir la
  beta y completar el ensayo de ambos flujos antes de difundir el enlace.
- Comprobar en ES y EN la confirmación por correo, Google con una identidad
  nueva, Google con la cuenta existente y el aislamiento de la biblioteca y
  del progreso. El contacto para privacidad debe permitir también consultas
  de quien no tenga cuenta.
- Si hay que pausar altas, cerrarlas primero en Supabase Auth y desactivar
  `LEXORA_ALLOW_REGISTRATION` en Vercel. Los inicios de sesión de cuentas
  existentes y sus datos se conservan.

Para recoger comentarios en clase, pedir el dispositivo, el paso en que se
atascaron y qué esperaban que ocurriera. Un comentario puede comunicarse
directamente al propietario durante la beta.
