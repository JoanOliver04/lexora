# Compatibilidad y progreso entre contextos independientes

Fecha: 2026-11-12. Solo backend local, cuentas@example.com y datos sintéticos.
No se compartió storageState entre los contextos ni se manipuló una cuenta real.

Cada caso abre escritorio1440×900 y otro contexto393×873 con cookies inicialmente
vacías. El segundo inicia sesión por sí mismo en la misma cuenta. Se comprueba:

1. Sin conexión, se conserva la respuesta revelada y no se puede valorar.
2. Se retiene una petición de repaso real y se acredita su interceptación.
3. Durante la espera, el historial del otro contexto y la DB siguen con0 repasos.
4. Tras liberar y confirmar, ambos muestran1 repaso y la DB contiene un único log.
5. Se conserva el recuento tras navegar a Hoy; no hay errores JavaScript capturados.
6. El contexto estrecho pasa reflow320px, texto200%, objetivos táctiles y capturas.

Chromium final:4 PASS ES/EN×escritorio/móvil. Matriz adicional:8 PASS sin retries,
Firefox y WebKit×ES/EN×tema de escritorio claro/oscuro; el contexto móvil usa
el tema opuesto. Firefox estrecho prueba viewport; WebKit usa emulación móvil
con UA/touch. Son motores automatizados y no Safari/iPhone o Firefox físicos.
La aceptación física real procede del [informe del propietario](LEX-9-installation.md).

La primera matriz dio5 PASS y3 fallos WebKit: el service worker podía evitar la
interceptación de page.route. En este escenario se bloquea el worker solo en el
contexto de la petición retenida y se exige observarla antes de continuar. El
contexto móvil conserva el worker. Se sigue llamando a la API/DB local reales;
no se sustituye el resultado ni se elimina la comprobación de0→1 logs.
La [documentación de Playwright](https://playwright.dev/docs/network#missing-network-events-and-service-workers)
describe esta limitación. PWA/caché/actualizaciones tienen sus pruebas propias.

Los tests están en la suite Chromium y en `pnpm e2e:compat`; la CI conserva sus
tres nombres protegidos y añade Firefox/WebKit. Las bibliotecas Linux de esos
motores se instalan con reintentos limitados por los fallos DNS anteriores,
sin ignorar una instalación fallida.

Gate general final930 PASS y1 omisión condicional, Node12 y build PASS.
Tres revisiones independientes cerradas. El preflight compartido valida URL y
clave antes de iniciar la app o crear cuentas y conserva los flags de cada modo.
La configuración parcial del shell y el fallback local tienen cinco regresiones
mock; otros cuatro casos prueban la frontera desde la CLI sin lanzar navegador.
La pasada real con URL en el shell y clave resuelta desde el fichero local terminó
normal4, acceso cerrado4 y Preview4 PASS, sin retries. Gitleaks8.30.1 sobre los670
archivos del snapshot publicable: sin secretos. La clave ficticia de la CLI se
sustituyó por un placeholder inequívoco, sin ampliar las exclusiones del escáner;
las nueve regresiones volvieron a pasar.
Pendientes: CI del head exacto y publicación.
