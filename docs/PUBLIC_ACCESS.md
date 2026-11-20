# Acceso público de Lexora

Lexora es una aplicación gratuita de JVOR Studios. Las nuevas cuentas se crean
con Google. Quien ya tiene una cuenta con contraseña puede seguir iniciando
sesión con ella.

## Activación de Google

1. Aplicar la migración que instala `private.google_only_public_signup` y
   configurar el hook **Before User Created** en Supabase Auth con la URI
   `pg-functions://postgres/private/google_only_public_signup`. La función solo
   admite altas de Google. El proveedor de correo debe seguir activo para
   conservar el acceso de cuentas existentes.
2. Una vez verificado el hook, habilitar las altas globales en Supabase
   Auth. La portada y la pantalla de alta muestran la opción de Google
   cuando Auth publica el proveedor activo y las altas abiertas. La interfaz
   puede tardar hasta un minuto en reflejar cambios de configuración.
3. Verificar el registro con una cuenta externa al proyecto, el retorno a la
   app y el primer curso vacío. Las credenciales y el retorno de Google a
   Supabase se gestionan en sus paneles. Lexora solicita solo los permisos
   `openid email profile`.
   [Estados OAuth de Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

El retorno de la app es `https://lexora-one-alpha.vercel.app/api/auth/callback`.
Supabase admite sus parámetros de idioma, flujo y destino cuando la URL
comparte origen con la Site URL de producción.

Para pausar altas, desactivar la opción global en Supabase Auth. Las cuentas
existentes conservan su acceso.

## Alta por correo

La activación por correo queda para más adelante. Requiere un remitente SMTP
verificado, confirmación de correo y verificación de entrega y recuperación
con una cuenta ajena al equipo. El cambio debe actualizar el hook de altas
y habilitar `LEXORA_ALLOW_REGISTRATION` junto con el contacto de privacidad.
El aviso en `/es/privacy` y `/en/privacy` admite un formulario HTTPS como
contacto con `LEXORA_PRIVACY_CONTACT` y `LEXORA_PRIVACY_CONTROLLER`.
[Correo de Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
