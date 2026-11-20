# Acceso con Google

Lexora admite nuevas cuentas con Google. Para acceder a una cuenta existente
con Google, usa el mismo correo verificado. El acceso por contraseña sigue
disponible para las cuentas que ya lo tienen.

## Configuración única del propietario

1. Abre el proyecto de Lexora en [Supabase](https://supabase.com/dashboard),
   Authentication → Sign In / Providers → Google. Copia su **Callback URL**;
   tiene la forma `https://<project-ref>.supabase.co/auth/v1/callback`.
2. En [Google Auth Platform](https://console.cloud.google.com/auth/overview),
   reutiliza el proyecto/cliente de Lexora si ya existe. Configura el nombre
   Lexora y los datos que Google exige a su propietario. Limita los permisos a
   `openid`, `email` y `profile`. Comprueba la pantalla de Google con una
   cuenta externa. [Estados OAuth de Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
3. En Clients, crea o edita un cliente OAuth de tipo **Web application**.
   Origen JavaScript autorizado: `https://lexora-one-alpha.vercel.app`.
   URI de redirección autorizado: la Callback URL exacta copiada de Supabase.
   El retorno de Google apunta a Supabase; no a `/en` ni al callback de Next.
4. Copia el Client ID y Client secret **directamente a Supabase**, habilita
   el proveedor Google y guarda. No los envíes por chat ni los pongas en Git,
   `.env.local` o Vercel. Lexora no necesita esas credenciales.
5. En URL Configuration, conserva el origen de producción como Site URL y
   añade su retorno canónico `https://lexora-one-alpha.vercel.app/api/auth/callback`.
   Gestiona la creación de cuentas en [Acceso público](PUBLIC_ACCESS.md).

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
su consola correspondiente. Para comprobar el alta, abre `/es/signup` o
`/en/signup` con una cuenta que todavía no exista en Lexora. Verifica que
llegas a la creación del primer curso y que la biblioteca está vacía.

Fuentes oficiales: [Google OAuth en Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[identidades verificadas](https://supabase.com/docs/guides/auth/auth-identity-linking),
[allowlist de retornos](https://supabase.com/docs/guides/auth/redirect-urls).
