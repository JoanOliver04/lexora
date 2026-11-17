# ADR-011 — Google como acceso adicional a la cuenta personal

**Fecha:** 2026-11-12. **Estado:** aceptada para implementación por petición del propietario.

El propietario pide entrar con Google y conservar Lexora privada. El registro
permanece cerrado en la aplicación y en Supabase Auth. Esta decisión amplía
[ADR-008](008-personal-use.md) con un proveedor de identidad opcional.

Se utiliza `signInWithOAuth` del SDK existente con PKCE, cookies SSR y el retorno
`/api/auth/callback`. Solo se solicitan `openid email profile`; no hay acceso a
Gmail, Drive ni credenciales de Google en Lexora. El secreto del cliente OAuth
reside exclusivamente en la configuración del proveedor de Supabase.

La identidad verificada con el mismo correo se vincula mediante el mecanismo
automático de Supabase. Lexora no fusiona usuarios por correo, no recibe un ID
de propietario desde el formulario y no emplea credenciales administrativas.
La sesión, el perfil y RLS siguen determinando el acceso a los datos existentes.
Si el correo de Google es distinto, no se debe abrir el registro para sortearlo.

La acción POST genera una URL de retorno desde el origen canónico configurado,
valida idioma y destino interno y comprueba el destino Auth y el desafío S256
generados por el SDK. La protección de origen de Server Actions se conserva.
El callback nunca usa `Host` ni cabeceras reenviadas para redirigir; los códigos
se canjean mediante el SDK. Los errores remotos se convierten en una clave
estable, sin reflejar mensajes ni tokens, con `no-store` y `no-referrer`.

En modo `auto`, el botón aparece al estar habilitado Google en las opciones
públicas de Auth. Solo esas opciones se almacenan en caché durante 60 segundos,
sin cookies ni cabecera Authorization, con timeout de tres segundos y fallo
cerrado. El acceso por correo permanece disponible. `LEXORA_GOOGLE_AUTH`
permite `disabled` o `enabled` para despliegue controlado y tests; no cambia la
configuración de Auth ni autoriza registros. Preview deniega antes de consultar
el proveedor o crear un cliente, incluso con ese override.

Se mantiene un botón nativo accesible, el G oficial sin alterar y Google Sans
Medium autoalojada por Next. No se carga JavaScript de Google ni un iframe,
por lo que no se amplía CSP para esta integración.

La activación externa y el primer acceso real son un requisito independiente
del código. Véase [la guía](../GOOGLE_SIGN_IN.md) y Q-011. Las pruebas locales
usan únicamente la generación real del SDK y una cancelación sintética;
no acreditan consentimiento ni vinculación de una identidad real de Google.

Fuentes: [Google con Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[vinculación de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking),
[registro cerrado](https://supabase.com/docs/guides/auth/general-configuration),
[SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide),
[marca de Google](https://developers.google.com/identity/branding-guidelines).
