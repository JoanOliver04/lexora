# Activar el acceso personal con Google

Lexora conserva el acceso por correo y contraseña y el registro cerrado.
Google debe usar **el mismo correo verificado que tu cuenta existente**.
No hace falta crear otra cuenta en Lexora, migrar datos ni contratar un servicio.

## Configuración única del propietario

1. Abre el proyecto de Lexora en [Supabase](https://supabase.com/dashboard),
   Authentication → Sign In / Providers → Google. Copia su **Callback URL**;
   tiene la forma `https://<project-ref>.supabase.co/auth/v1/callback`.
2. En [Google Auth Platform](https://console.cloud.google.com/auth/overview),
   reutiliza el proyecto/cliente de Lexora si ya existe. Configura el nombre
   Lexora y los datos que Google exige a su propietario. Para uso personal con
   audiencia External en Testing, añade tu cuenta como usuario de prueba.
   Limita los permisos a `openid`, `email` y `profile`.
3. En Clients, crea o edita un cliente OAuth de tipo **Web application**.
   Origen JavaScript autorizado: `https://lexora-one-alpha.vercel.app`.
   URI de redirección autorizado: la Callback URL exacta copiada de Supabase.
   El retorno de Google apunta a Supabase; no a `/en` ni al callback de Next.
4. Copia el Client ID y Client secret **directamente a Supabase**, habilita
   el proveedor Google y guarda. No los envíes por chat ni los pongas en Git,
   `.env.local` o Vercel. Lexora no necesita esas credenciales.
5. En la configuración general de Auth, mantén **Allow new users to sign up
   desactivado**. En URL Configuration, conserva la URL de producción como
   Site URL y autoriza el retorno canónico de Lexora:
   `https://lexora-one-alpha.vercel.app/api/auth/callback` (con los parámetros
   de idioma y destino que admite la allowlist de Supabase). La configuración
   existente de recuperación por correo debe conservarse.

Con `LEXORA_GOOGLE_AUTH=auto` (valor predeterminado), el botón aparece al
recargar el acceso después de hasta 60 segundos. No requiere otro despliegue
ni nuevas variables de Google en Vercel. Si Google no está activo, el botón se
oculta y el acceso por correo sigue disponible.

## Comprobar la cuenta existente

Abre `/es/login` o `/en/login`, pulsa Continuar con Google y selecciona la
cuenta del mismo correo. Comprueba que aparecen tu biblioteca y tu progreso
habituales. Cierra sesión y vuelve a entrar por correo para confirmar ambos
caminos. Una cancelación debe volver al acceso con un mensaje legible.

Si aparece un error de URI de redirección, revisa las dos URLs anteriores en
su consola correspondiente. Si Google no deja elegir tu cuenta en Testing,
comprueba que está añadida como usuario de prueba. No abras las altas ni
modifiques los usuarios/datos para resolver un problema de configuración.

La herramienta disponible en esta sesión no gestiona clientes de Google Cloud
ni la configuración Auth del proyecto; la creación/copia del secreto debe
realizarla el propietario en esas consolas. La aceptación real se registra
solo después de esa comprobación, separada de las pruebas automáticas locales.

Fuentes oficiales: [Google OAuth en Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[identidades verificadas](https://supabase.com/docs/guides/auth/auth-identity-linking),
[allowlist de retornos](https://supabase.com/docs/guides/auth/redirect-urls).
