# Instalación personal y conexión

Lexora abre Hoy al iniciarse desde su icono. `/app` consulta solo el idioma del
perfil propio tras verificar la sesión y redirige al Hoy localizado; las URL con
idioma explícito conservan su autoridad. Si no hay perfil/idioma válido se usa el
routing habitual. No guarda una credencial en el
manifest. El nombre y los iconos son propios. `manifest.ts` declara standalone,
scope e ID estables, iconos PNG 192/512, maskable y Apple. El SVG es el origen
reproducible de los PNG y el favicon: `node scripts/generate-pwa-icons.mjs` utiliza
el navegador de pruebas ya existente, sin otro servicio o dependencia.

## Instalar

En ajustes aparece el control cuando el navegador expone `beforeinstallprompt`.
El evento se captura en la raíz para conservarlo al navegar a ajustes. Solo se
invoca tras pulsar Instalar; se distinguen solicitud aceptada, descartada, error e
instalación comunicada por el navegador. Sin esa API se muestra la opción de usar
el menú del navegador cuando esté disponible. No se fuerza un popup ni se promete
instalación en todos los navegadores. No se añaden notificaciones push.

La [guía oficial de Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps)
describe el manifest y el registro del service worker. Se mantiene el alcance de
[ADR-004](adrs/ADR-004-pwa-online-first.md): estudiar y guardar cambios requiere red.

## Frontera de caché

`public/sw.js` precachea exactamente `/offline.html`, `/offline.css`, `/offline.js`
y `/icons/lexora.svg`, con credenciales omitidas. Solo esos recursos públicos se
sirven desde Cache Storage. Las navegaciones usan red y, únicamente ante un fallo
de red, devuelven la pantalla neutral. Una respuesta 4xx/5xx del servidor mantiene
su resultado. El fallback no tiene tarjetas, formularios o información de cuenta.

POST, APIs, RSC, lecturas de aplicación y otros orígenes pasan a red. No existe
cola offline, handler sync, caché de páginas privadas ni almacenamiento de sus
respuestas por el service worker. Las cabeceras privadas existentes siguen
impidiendo caché compartida HTTP. El DOM que ya estaba abierto en una pestaña
no se presenta como una descarga offline de la biblioteca.

El aviso de conexión refleja `navigator.onLine`; no sustituye la confirmación
del servidor. La pantalla neutral explica cómo comprobar una acción que quedó
sin confirmar antes de repetirla. Volver a intentar recarga la URL y recupera
el flujo normal una vez disponible la conexión.

## Actualizaciones

El registro usa `updateViaCache: none` y `sw.js` responde no-cache/no-store. La
activación borra únicamente versiones viejas del prefijo `lexora-public-`,
conserva cachés ajenas y reclama los clientes. Puede activar inmediatamente porque
no sirve un app shell ni datos: el código y las operaciones de aplicación siguen
su ruta de red normal. No se recarga automáticamente un formulario abierto.

Al cambiar los recursos del fallback hay que incrementar `CACHE_NAME` y probar
la actualización. El ciclo corresponde al modelo de
[instalación/activación de service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
Si el navegador elimina su almacenamiento, se necesita una visita con conexión
para preparar de nuevo el fallback; no se promete disponibilidad offline ilimitada.

## Accesibilidad de la entrada

Idioma y tema usan controles en flujo, con wrapping y objetivos táctiles amplios.
El tema utiliza radios nativos y sus flechas de teclado. Las zonas seguras se
respetan sin desactivar zoom. Si se bloquea `localStorage`, el tema se conserva
en memoria en esa pestaña, con radio y color coherentes. Los cambios compartidos
y el borrado de almacenamiento actualizan también el documento.
Se cubren portada, login, registro, recuperación y
reset, en ES/EN, a 320 px/texto 200 %. La escala CSS de pruebas no acredita zoom
nativo, lector de pantalla o instalación física en Android/iOS.
