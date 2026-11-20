# Seguridad de despliegue

Lexora utiliza Supabase Auth, una clave pública y el JWT del usuario; las consultas
de negocio siguen sujetas a RLS. Supabase admite altas con Google y permite
entrar con contraseña a quienes ya tienen cuenta. [Acceso público](PUBLIC_ACCESS.md).

Google usa OAuth con PKCE. El secreto está solo en Supabase. La aplicación
cachea durante 60 segundos los indicadores públicos de Auth, que se consultan
sin una sesión de usuario.

## Navegador y sesiones

El proxy crea un nonce aleatorio de 192 bits por respuesta y sobrescribe cualquier
nonce/CSP enviado por el visitante. next-intl transmite las cabeceras de petición
a Next, que asigna el nonce a sus scripts. El bootstrap de tema lo recibe
explícitamente. El HTML localizado se renderiza por petición y responde
`private, no-store`: un nonce no puede reutilizarse desde un HTML prerenderizado
o una caché compartida. Esto tiene un coste de SSR, aceptado para este despliegue.

En producción, script-src exige nonce/strict-dynamic y no admite unsafe-inline
ni unsafe-eval. Eval solo se permite en `next dev`. Los estilos inline existentes
siguen permitidos para layout/gráficos; no se habilitan scripts inline por ello.
Conexiones limitadas al mismo origen y al origen Supabase configurado, recursos
locales, sin objetos/iframes y sin formularios a otros orígenes. HTTPS canónico
activa upgrade-insecure-requests; el build local HTTP conserva su funcionamiento.
El diseño sigue la [guía CSP de Next](https://nextjs.org/docs/app/guides/content-security-policy).

Todos los recursos reciben nosniff, X-Frame-Options DENY, referrer policy,
COOP same-origin y permisos de cámara/micrófono/geolocalización/pagos/USB denegados.
El fallback offline utiliza su política estática para JS/CSS externos locales;
la actualización del service worker renueva también sus respuestas cacheadas.
No se cachean páginas privadas ni se encolan escrituras de estudio.

Las cookies Supabase fijan path `/`, SameSite Lax y Secure cuando la URL canónica
es HTTPS. Son HttpOnly porque el intercambio PKCE, sesión y renovación ocurren
en el servidor. Las cookies de una sesión anterior adoptan el atributo al
reescribirse durante una renovación o un nuevo inicio. La renovación propaga
cookies a petición y respuesta;
una prueba de navegador marca caducado su expires_at local y comprueba
la rotación persistida, la página autenticada y una recarga posterior.

Las APIs de escritura comparan Origin con el origen configurado y limitan el
cuerpo. Server Actions conservan la comprobación Origin/Host de Next.
RLS y los casos de uso siguen siendo las barreras de propiedad, con independencia
de las redirecciones del proxy o del layout.

El endpoint público de salud comparte una sonda pendiente por instancia y la
reutiliza durante diez segundos tras completarla. La respuesta HTTP conserva
`no-store`; la ventana acotada también aplica si la base está degradada. Este
control limita el coste de las comprobaciones en cada instancia desplegada.

## Antes de habilitar altas por correo

Para ampliar las altas a correo, verifica primero el envío de confirmaciones a
un destinatario externo, la recuperación y los límites de Auth.
La app exige doce caracteres y como máximo 72 bytes UTF-8 al crear o cambiar
una contraseña. Configurar también el mínimo en Supabase Auth es necesario
porque la API del proveedor aplica su propia política. El archivo local activa
el cambio seguro de contraseña para exigir autenticación reciente. La
configuración efectiva del proyecto alojado se revisa por separado.

Supabase documenta la protección contra contraseñas filtradas para Pro y planes
superiores. El asesor del proyecto gratuito la marca desactivada. La aceptación
del riesgo o un cambio de plan requiere una decisión del propietario. Revisar
también CAPTCHA, cuotas del proveedor, entrega de confirmaciones por SMTP,
retornos de OAuth y recuperación, MFA de las cuentas de administración y la
política de privacidad antes de cambiar el alcance. Ver la
[lista de seguridad de Supabase](https://supabase.com/docs/guides/security/production-checklist)
y su [política de contraseñas](https://supabase.com/docs/guides/auth/password-security).

Si se ofrece MFA a usuarios de Lexora, completar antes el desafío al entrar
y exigir AAL2 en las políticas del acceso a datos para cuentas con MFA. La
comprobación de segundo factor existente se aplica al borrado de cuenta.

## Preview y claves

Las funciones se configuran en una única región, París (`cdg1`), próxima a la
base de datos eu-west-3. Se mantiene una sola región, admitida en Hobby según la
[documentación de regiones](https://vercel.com/docs/functions/configuring-functions/region).
No se añade failover de pago ni un cambio de plan. La CDN y el middleware tienen
su propio enrutamiento; la ubicación efectiva de las funciones se comprueba
después del despliegue y no se deduce de la región del edge por sí sola.

`vercel.json` solo habilita despliegues Git de main. Una Preview manual no puede
usar el backend personal: VERCEL_ENV=preview bloquea sesión, Auth, health de DB y
APIs privadas antes de I/O. VERCEL=1 sin entorno conocido también deniega acceso.
Los formularios de Auth muestran una explicación sin campos. La fábrica de
clientes deniega una llamada directa como segunda barrera.
Las variables son las [variables de sistema de Vercel](https://vercel.com/docs/environment-variables/system-environment-variables).
No se debe forzar production en una Preview ni habilitarla con la base personal.
Un futuro entorno navegable requiere backend/datos sintéticos aislados y una
decisión explícita; esta barrera no configura ese entorno.

El esquema público acepta publishable keys o claves legacy con rol anon y rechaza
claves secretas/JWT de usuario/service_role antes del build. Es una protección
frente a errores de configuración, no una verificación criptográfica de sesiones:
esta corresponde a Auth/getClaims/getUser y a RLS. El bundle público nunca es
un lugar para una credencial privilegiada.

## Errores y logs

El traductor LibraryError descarta message/details/hint/cause del proveedor;
solo mantiene contexto estático y código técnico acotado. Los ocho registros de
acciones de biblioteca emiten únicamente una categoría estable. Una fila rechazada
por un CHECK no termina dentro del error registrado. sourceReference se valida
a 500 caracteres también en dominio, sin depender de maxLength del navegador.
El usuario recibe claves de error traducidas y no detalles SQL.

## CI y revisión de secretos

Los tres trabajos tienen timeout de 30 minutos, token contents:read y checkout sin
credenciales persistidas. Las cuatro acciones se fijan con SHA completo, resuelto
en los repositorios oficiales. Las instalaciones usan el lockfile congelado y no
autorizan scripts de instalación. `pnpm audit` se ejecuta como control de CI.
Estas medidas siguen la [guía de seguridad de GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).

Calidad descarga Gitleaks 8.30.1 desde su release oficial y verifica el SHA256 Linux
fijado en el workflow y la versión antes de ejecutarlo. El checkout completo
permite `gitleaks git --redact --timeout 120 --log-opts="--all" .`.
Un hallazgo no autorizado hace fallar el trabajo. No se validan credenciales contra
servicios remotos ni se publican informes con valores sensibles.

Hay una excepción exacta en `.gitleaksignore` para la clave publishable local
histórica de CI, y una anotación en su línea actual. La URL corresponde al stack
local desechable y esa clave está diseñada para ser pública; no se excluyen
directorios completos de pruebas o documentación. Se revisa si cambia ese destino.

El escaneo local adicional usa un snapshot de todos los archivos versionados y
nuevos no ignorados. No cubre automáticamente `.env`, documentación privada,
backups, almacenes de credenciales, comentarios remotos ni logs del proveedor.
El control positivo sintético comprueba que el detector realmente encuentra un
patrón de secreto. Un escaneo sin hallazgos no demuestra ausencia de toda clase
de secretos ni sustituye rotar una credencial que se haya expuesto.

Evidencia ejecutada y límites en [LEX-9-security](evidence/LEX-9-security.md).
