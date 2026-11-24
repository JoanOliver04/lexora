# Lexora — Estado actual

**LEX-23.11 · Practicar tarjetas difíciles.** Estadísticas permite practicar
una vez cada tarjeta de la lista visible, hasta veinte y con el filtro de mazo
actual. La ronda permite revelar, escribir y repetir las marcadas. Desde Hoy
se puede abrir la lista del curso completo o del único mazo seleccionado.
Esta práctica lee las tarjetas y conserva las fechas y el historial de repaso.

**LEX-23.10 · Practicar un mazo.** Desde la lista de conceptos de un mazo
se puede abrir cada ficha. En Estudio libre se puede elegir una ronda de
hasta cinco o diez tarjetas distintas, una vuelta completa o la práctica
continua. Las rondas cortas cargan sus tarjetas al empezar. El contador
refleja las disponibles y al terminar se pueden repetir las marcadas.

**LEX-23.9 · Importación de mazos.** Al cambiar el archivo, editar el texto
pegado o alternar entre ambos, el asistente pide una nueva vista previa. Si
cambian las columnas, permite avanzar después de actualizar la muestra. El
resultado enlaza al mazo que confirmó la importación y, si se crearon filas,
a su práctica libre.

**LEX-23.8 · Preparación de estudio.** Al empezar una práctica libre, la
primera petición devuelve el orden aleatorio y un máximo de doce tarjetas.
El resto se lee a medida que se avanza. En la preparación del repaso y de la
práctica libre se puede ver la selección completa y desmarcar mazos aunque
se hayan elegido en distintas páginas. Al volver se conserva la búsqueda.

**LEX-23.7 · Práctica desde la biblioteca.** La ficha de un mazo activo con
conceptos enlaza al repaso programado y al estudio libre con ese mazo seleccionado.
Hoy y Estudio conservan los filtros al abrir Estudio libre. En ambos modos se
puede escribir una respuesta para compararla con la solución. El borrador
permanece en la tarjeta abierta. En Estudio libre, las tarjetas marcadas
se pueden practicar una vez cada una desde el resumen. El historial de repasos
y el calendario FSRS solo cambian al valorar una tarjeta en estudio programado.
Las pruebas de navegador cubren el filtro del mazo, la comparación escrita,
el foco de teclado y la práctica de marcadas en español e inglés.
La sesión activa muestra el número disponible y el alcance encima de la tarjeta.
La fecha de creación y los atajos de teclado se pueden desplegar cuando hacen falta.

**LEX-23.6 · Carga de Hoy, Estudio y Estadísticas.** La cola diaria recupera
las tarjetas y su estado de aprendizaje en la misma página de Supabase.
Con 1.101 tarjetas sintéticas, la mediana de cinco lecturas locales pasó de
258 a 75 ms y el número de peticiones por lectura bajó de 15 a 3. El cálculo
del informe de 90 días reutiliza los formateadores de zona horaria. Con
actividad vacía y el cambio de hora de Madrid, su mediana de once ejecuciones
pasó de 24,25 a 5,73 ms. Ambas medidas corresponden a operaciones del servidor.
Validación local en `perf/lex-23-6-study-reads`: `pnpm check` en verde
(984 pruebas ejecutadas, 67 omitidas por el conjunto general, 12 de copias
y build). Con Supabase local pasaron las 35 pruebas de integración dirigidas.
Playwright pasó los 14 escenarios de Hoy, Estudio libre e Historial/Estadísticas
en Chromium de escritorio y móvil emulado.

**LEX-23.5 · Verificación de propiedad.** Search Console recibe el archivo
original en `/google6ec811eafa695f08.html` sin entrar en el enrutado de idioma.
La comprobación en el panel de Google corresponde al titular de la propiedad.

**LEX-23.4 · Condiciones del servicio.** La página pública, en `/es/terms` y
`/en/terms`, describe el estudio gratuito, el acceso con cuenta, el material
que añade cada persona y las opciones de descarga y borrado. La portada y
las pantallas de acceso la enlazan junto a Privacidad. [Enlaces para Google
Auth Platform](PUBLIC_ACCESS.md#enlaces-de-google-auth-platform).

**LEX-23.3 · Portada pública.** La portada explica cómo estudiar con los mazos
propios, ofrece una tarjeta interactiva en ES y EN y enlaza al alta, al inicio
de sesión y a privacidad. Se retiró el enlace a GitHub. [Enlaces públicos
para Google Auth Platform](PUBLIC_ACCESS.md#enlaces-de-google-auth-platform).

**LEX-23.2 · Bibliotecas grandes en estudio.** La cola diaria y el estudio libre
leen tarjetas elegibles por lotes de 500 mediante una consulta con relaciones y
un cursor por ID. Se conservan el alcance por curso y mazos, los filtros de
archivo y los controles de acceso. En el laboratorio con 1.101 tarjetas, cinco
lecturas por versión pasaron de 16 a 3 peticiones a Supabase, con medianas de
228 a 45 ms. El selector compartido muestra 24 mazos por página y conserva
las selecciones al buscar y cambiar de página.

**Dependencias.** GitHub retiró el aviso de picomatch. La auditoría del lockfile
pasó con cero avisos tras retirar su excepción temporal.
[Evidencia](evidence/LEX-17-dependency-review.md).

**LEX-23.1 · Acceso público con Google.** Las altas con Google están abiertas en
producción desde el 20 de noviembre de 2026. El acceso por contraseña sigue
disponible para cuentas existentes. Se verificaron las pantallas y el inicio
de OAuth en ES y EN. Queda comprobar el primer curso con una cuenta Google
externa. Las altas por correo quedan pendientes de SMTP y de su verificación.
[Operación y comprobaciones](PUBLIC_ACCESS.md).

**LEX-22.13 · Prioridad de los repasos vencidos.** Cuando el cupo diario no
cubre todos los vencidos, la cola da prioridad a las tarjetas con menor
probabilidad de recuerdo estimada por FSRS. Las tarjetas con datos
insuficientes conservan su posición cronológica. La fecha guardada sigue
determinando cuándo entra cada tarjeta. [Lógica de la cola](FSRS.md#cola-diaria).

**LEX-22.12 · README del proyecto.** La presentación recoge varios cursos,
estudio programado y libre, importación y copias restaurables. Incluye un CSV
de ejemplo, instrucciones de arranque local y dos capturas con datos
sintéticos. [README de Lexora](../README.md).

**LEX-22.11 · Límites diarios y calendario de estudio.** El guardado del repaso
comprueba el cupo del curso dentro de la misma transacción, incluso con dos
sesiones activas. Las valoraciones ya guardadas se pueden reintentar y los pasos
cortos de aprendizaje conservan su comportamiento. La cola, el historial y las
estadísticas usan el primer instante válido de cada día en la zona del perfil.

**LEX-22.10 · Rendimiento de carga y navegación.** El perfil y el curso activo
se leen juntos y se reutilizan durante la petición. Hoy solapa las lecturas
independientes. El navegador carga los logotipos fijos directamente y reserva
el código de restauración y validación del repaso para cuando se usa.
[Mediciones de laboratorio](evidence/LEX-9-web-lab.md#rendimiento-de-carga-y-navegación-lex-2210).

**LEX-22.9 · Idioma libre al crear un curso.** Mis cursos admite escribir
cualquier idioma con sugerencias opcionales. Los idiomas del catálogo conservan
su código y los demás guardan el nombre en el propio curso, disponible en el
selector, en el prompt de importación y en las copias JSON y CSV.

**LEX-22.8 · Importación en varios idiomas.** La plantilla y el prompt siguen
el idioma del curso. Mis cursos muestra el idioma junto al nombre. Al entrar
desde un mazo, el asistente conserva el destino y el modo seleccionados y
enlaza cualquier importación pendiente que deba resolverse antes.

**LEX-22.7 · Tiempo de estudio y varios cursos.** Hoy y Estadísticas muestran
segundos para totales inferiores a un minuto y distinguen ausencia de medición.
El guardado mantiene los milisegundos visibles por valoración durante los
reintentos. La cabecera enlaza a Mis cursos, desde donde se puede cambiar de
curso y crear uno vacío en inglés, francés, alemán o italiano. La migración
añade idiomas y un RPC de alta sin reescribir el curso existente.

**LEX-22.6 · Buscador de mazos y copias restaurables.** El selector de mazos
filtra por título en Estudio libre y en el estudio programado sin perder las
selecciones. Ajustes revisa y restaura el JSON o CSV de la misma cuenta con
confirmación, sesión reciente y una reconstrucción atómica. Los CSV nuevos
incluyen el checksum de su contenido. [Formatos y restauración](DATA_EXPORT.md).

**LEX-22.5 · Revelar respuesta e importar en un mazo existente.** Estudio libre
muestra el frente y ofrece revelar el reverso en cada visita a una tarjeta.
Editar mazo ofrece Añadir, que omite frentes repetidos en el archivo o en el
destino, y Reemplazar, que actualiza solo la pertenencia al mazo al terminar.
El reemplazo pide confirmación y conserva conceptos, tarjetas e historial
anteriores en la biblioteca y en los demás mazos donde estén.

**LEX-22.4 · Campos opcionales del mazo al importar.** Crear un mazo desde el
asistente muestra descripción, nivel y categoría con los mismos campos y
validaciones de Mis mazos. Se puede crear el mazo solo con un nombre. Los
valores se conservan ante un error y el mazo creado se selecciona sin perder
la vista previa del archivo.

**LEX-22.3 · Estudio libre, C2 e importación.** Hoy y Estudio enlazan a un modo
para recorrer las tarjetas de uno, varios o todos los mazos activos. Las
tarjetas se barajan al empezar cada vuelta. Se puede volver por el recorrido y el
resumen muestra tarjetas recorridas, tarjetas distintas y tiempo. Los datos de
esta sesión duran hasta salir de la página o recargarla. C2 es seleccionable
en el alta del curso, la biblioteca, filtros y preparación de importaciones.
El asistente destaca el botón de archivo y ofrece crear un mazo incluso si hay
destinos existentes. Comprobar pendientes consulta la cola con el reloj del
servidor y anuncia el resultado.

**LEX-22.2 · Confirmación de importación sin mazo previo.** El asistente permite
crear el primer mazo del curso desde el paso de destino o el resumen en ES y EN.
El mazo creado queda seleccionado y la vista previa permanece disponible para
confirmar las tarjetas. Se reutiliza la creación de mazos del curso activo.

**LEX-22.1 · Plantillas y preparación de temas para importar.** Ejemplos
previos y CSV descargable para vocabulario, gramática y frases. El prompt
configurable para ChatGPT admite nivel A1–C1, cantidad, idioma de las respuestas
y enfoque. Se puede pegar CSV o TSV directamente y usar la misma revisión de
columnas, duplicados y mazo que con archivos. Disponible en ES y EN, con la
guía de importación actualizada. [Formato y flujo](IMPORT_FORMAT.md).

**LEX-20.1 · Refuerzo previo a la apertura pública.** Cookies de sesión y PKCE
HttpOnly, nueva política de contraseñas en altas y recuperación, coste acotado
de la sonda de salud y saneamiento de importación sin búsquedas repetidas sobre
comentarios o etiquetas incompletos. La configuración de Auth local se refuerza
para pruebas nuevas. Los ajustes de apertura pública del proyecto alojado
tienen su propia comprobación en [Seguridad de despliegue](DEPLOYMENT_SECURITY.md).
Registro privado vigente. Los resultados remotos se registran en la PR.

**LEX-19.1 · Tutoriales integrados.** Ayuda se abre desde Hoy, la navegación
y los accesos rápidos. Incluye una ruta para la primera sesión, seis guías por
tarea, una tarjeta de ejemplo sin persistencia y ayuda contextual desplegable
en Estudio e Importar. Las guías se sirven en español e inglés en el área
autenticada y enlazan a las pantallas reales. Sin migraciones ni dependencias.
Las comprobaciones de CI y publicación se registran en la PR.

**LEX-18.1 · Logotipo definitivo.** El PNG de 1254 × 1254 px aprobado se guarda
intacto en `assets/brand/logo-lexora.png`. El generador existente usa Chromium
para producir el favicon 16/32/48, los iconos de instalación 192/512, Apple 180
y el PNG ligero de interfaz. El icono maskable de 512 px conserva el símbolo
dentro del círculo de radio 40 %. Se actualizan portada, acceso, aplicación
y pantalla sin conexión mediante el componente de marca y el fallback existentes.

Next.js declara un solo favicon. El manifest conserva ID, ámbito y URL de
inicio, y usa rutas versionadas para los PNG. El service worker cambia solo
la lista y versión de su caché pública. Las comprobaciones de publicación se
registran en la PR. [Regeneración de iconos y actualización en Android](PWA.md).

**Salida del adaptador de Vercel — 2026-11-18:** el tercer log identifica
modifyConfig/onBuildComplete, una vía distinta de Next sin adaptador. Se
reprodujo con @vercel/next27.0.0 en Linux aislado: compila, entrega55 funciones
mediante Build Output API3 y no emite ninguna traza raíz NFT. El guard antiguo
fallaba después de compilar. La validación ahora usa los metadatos efectivos
del build: NFT para Next normal/mínimo, o config.json y los filePathMap de
todas las funciones para el adaptador. Exige rutas críticas, versión de Next,
runtime, handlers existentes y referencias válidas, sin admitir salida vacía.
No usa un flag para omitir la comprobación ni acepta restos de otro build.

Regresión CLI:1 FAIL antes del arreglo;12 pruebas del guard PASS después.
Repetición del build con el adaptador oficial en Linux: exit0,55 funciones y
18684 referencias comprobadas. No hay dependencias nuevas de app, SQL, Auth,
datos ni cambio de caducidad. Gate general exit0:970 PASS+1 omisión privada,
Nodebackup12/política12, formato/lint/tipos/28 contrastes/build/NFT PASS.
Revisión DEEP y pasiva de seguridad de los cinco archivos sin hallazgos
accionables; build mínimo posterior PASS y Gitleaks8.30.1 del diff sin fugas.
Faltan CI y Production; los resultados remotos se registran en
la PR de corrección.

**Build de plataforma Vercel — 2026-11-18:** PR119 corrigió y verificó el
formato JSON (CI44275571017 SUCCESS; merge7aa853d), pero Production7879557579
volvió a fallar. Una prueba independiente con NOW_BUILDER=1 reprodujo un segundo
defecto del guard, confirmado después por el nuevo log del propietario:
Next genera next-minimal-server.js.nft.json en vez de next-server.js.nft.json.
La compilación terminó y el guard falló con Missing production server trace.
Ahora exige la traza del modo correspondiente y sigue revisando todas las NFT;
no se acepta un nombre arbitrario ni se omiten controles. Nueva regresión:
1 FAIL antes del arreglo; después11 pruebas del guard PASS y registro/trazas
del build de plataforma PASS. La CI añade también el build real con esa señal,
además del build normal. Gate final exit0:970 PASS+1 omisión privada,
Nodebackup12/política11, formato/lint/tipos/28 contrastes y ambos builds PASS;
traza completa2 archivos compilados y mínima0, con los límites documentados.
Revisión DEEP y pasiva de seguridad de los cinco archivos sin hallazgos
accionables; diff sin fugas con Gitleaks8.30.1. Rama
fix/lex-17-vercel-server-trace; faltan CI del nuevo head y Production verificada,
que se registran en la PR de corrección. No hay cambios de app,
Auth/RLS, datos, SQL, paquetes ni caducidad de la excepción.

**Corrección de publicación1.3.0 — 2026-11-18:** el log aportado por el
propietario permitió reproducir el fallo de Production7867388849: Vercel
reescribe vercel.json como JSON compacto con salto final. El guard comparaba
bytes y rechazaba ese cambio de formato. Ahora normaliza solo ese JSON antes
de obtener su huella; siguen bloqueándose cambios en sus valores. Las otras
seis huellas, los comandos, la caducidad y el resto de controles no cambian.
Regresión CLI real:1 FAIL con la huella exacta antes del arreglo; después10 PASS
en el conjunto del guard, incluidos formato alternativo, cambios reales y JSON
inválido. Registro/trazas PASS. Q-012 cerrada por información recibida, sin
atribuir a ese cierre una publicación todavía no verificada. Rama de trabajo:
fix/lex-17-production-build. Gate completo exit0:970 PASS+1 omisión privada,
Nodebackup12/política10, formato/lint/tipos/28 contrastes/build/trazas PASS.
Revisión DEEP y pasiva de seguridad del delta sin hallazgos accionables;
Gitleaks8.30.1 del diff sin fugas. Faltan CI del head exacto y Production;
sus resultados se registran en la PR de corrección.

**Contexto anterior a la corrección — 2026-11-17:** PR118 fusionada en `f130c9f`,
con los tres checks SUCCESS en CI44182145804 sobre `c680aee`. E2E214 PASS+
4 omisiones; compatibilidad8, acceso cerrado4, Preview4 y Google8 PASS.
Production7867388849 falló. El canonical continúa sirviendo la versión anterior:
HTTP200/healthok, Google activo, altas cerradas y CSP/nonces/no-store verificados.
Falta consultar el error de build autenticado para corregir su causa; se ha
solicitado la integración de Vercel o el texto del error, sin secretos.
Se registra en [Q-012](OPEN_QUESTIONS.md#q-012--consultar-el-error-autenticado-del-despliegue130).
La tarea sigue en proceso hasta publicar y verificar la versión nueva.

**Entrega1.3.0 — 2026-11-17:** mejoras integradas de navegación y biblioteca.
Panel de accesos rápidos con búsqueda local ES/EN, Ctrl/Cmd+K, diálogo nativo,
foco restituido y uso móvil. Biblioteca con resultados, filtros removibles,
estados vacíos accionables, acceso a crear y distribución adaptativa. Hoy añade
acciones concretas para ampliar la biblioteca. Las operaciones de archivo,
restauración y orden muestran espera y bloquean su propio reenvío pendiente.

Corregidos dos errores reproducidos: búsquedas con parámetros repetidos (HTTP500)
y páginas fuera de rango (PGRST103). Se normalizan búsquedas/páginas, se conserva
el filtro en lecturas de recuento bajo RLS y se redirige a una página válida.
No hay migraciones, paquetes nuevos, cambios de Auth/RLS ni del motor FSRS.

La primera CI de esta entrega se detuvo por un aviso de picomatch sin versión
corregida. Se documenta una [excepción temporal](evidence/LEX-17-dependency-review.md)
solo para ese GHSA, con alcance no expuesto a patrones HTTP/importados según
la revisión, caducidad1dic2026 y guardas bloqueantes de lock/config/registro/
trazas. El aviso sigue identificado; no se declara corregido ni se desactiva
la auditoría del resto. El gate completo del build protegido volvió a dar970+1,
Nodebackup12 y política9 PASS; el P3 de build directo queda corregido y revisado.
Esta revisión de seguridad necesita su propia CI verde sobre el nuevo head.

Regresión de pantallas16 PASS sin retries, ES/EN×móvil/escritorio; regresión
final de interacciones8 PASS y compatibilidad Firefox/WebKit8 PASS. Integración
de biblioteca7 PASS y pgTAP603 PASS. Gate final970 PASS+1 omisión privada,
Nodebackup12/formato/lint/tipos/28 contrastes/build PASS. Tres revisiones
independientes sin hallazgos accionables en27 archivos. La publicación exige los
tres checks del head exacto y verificación Production. Resultados remotos en la
PR y evidencia de implementación en [LEX-17](evidence/LEX-17-workspace.md).

Los siguientes apartados conservan las entregas anteriores.

**Entrega1.2.0 — 2026-11-17:** niveles A1, A2, B1, B2 y C1
en onboarding, biblioteca y filtros. C1 clasifica contenido; no incorpora un
currículo precargado ni reclasifica datos existentes. Migración aditiva
`20261117161352_add_c1_level.sql` aplicada a producción y al backend local;
enum verificado con los cinco valores, sin cambios de filas ni RLS.
[ADR-012](adrs/012-c1-level.md) y [evidencia](evidence/LEX-16-c1.md).

Pruebas específicas: dominios41 PASS; pgTAP11 PASS y suite SQL603 PASS;
E2E4 PASS sin retries, móvil/escritorio y ES/EN, con selección, persistencia,
filtros y comprobaciones de accesibilidad. La revisión detectó el límite de
cinco grupos en estadísticas; corregido para admitir los cinco niveles más
contenido sin nivel, con regresión contra RPC real (rojo1 FAIL, después8 PASS).
La publicación requiere Calidad, Base de datos y Extremo a extremo verdes
sobre el head exacto; sus resultados y Production se registran en la PR.
Gate final tras la corrección:966 PASS+1 omisión privada, Nodebackup12 PASS,
formato/lint/tipos/28 contrastes/build PASS. No hay nuevas dependencias.

**Entrega1.1.0 publicada — 2026-11-17:** Google opcional para la cuenta personal
y diseño renovado. [PR116](https://github.com/JoanOliver04/lexora/pull/116),
head `cb48b85`, merge `bd0709a`, deployment7858441139 SUCCESS. Calidad, Base de
datos y Extremo a extremo SUCCESS en CI44114841801. El propietario confirma
«Ya funciona lo de google»; Q-011 se cierra por su aceptación funcional.

La regresión WebKit se reprodujo y corrigió pidiendo las rutas al navegar, en
lugar de precargarlas al entrar los enlaces en pantalla. Se conservan idioma,
destino, ref, opciones de navegación y opt-in de prefetch; no se filtran errores
ni se amplían timeouts. Compatibilidad8 PASS, gate962+1/Node12/build PASS.
El resto de la matriz y los resultados protegidos se registran en la PR y en
[la evidencia](evidence/LEX-15-google-sign-in.md).

Google está activo en las opciones públicas de Auth y el registro sigue cerrado.
`auto` es el defecto de la nueva versión; no se han leído ni cambiado secretos.
La confirmación no detalla comprobaciones individuales de UID o datos; no se
le atribuyen esas verificaciones.
La [guía de activación](GOOGLE_SIGN_IN.md) distingue los retornos de Google y Lexora.

Los siguientes apartados son checkpoints históricos de preparación/publicación.

**Comprobación de Google/producción — 2026-11-17.** El propietario comunica
Google Auth Platform External/Testing, cuenta de prueba y credenciales guardadas
directamente en Supabase; añadirá el retorno canónico. Lectura pública de Auth:
Google activo, correo activo y `disable_signup=true`. No se cambiaron opciones,
credenciales, altas ni el despliegue.

Producción continúa en `2f50def` (1.0.0), deployment7736813683 SUCCESS. `/es/login`
responde200/no-store y no contiene el botón ni el nuevo marco visual. PR116 sigue
abierta, sin fusionar, head `45e9221`. CI43242216566 terminó: Calidad y Base de
datos SUCCESS; E2E falla en compatibilidad WebKit (4 fallos por errores de acceso
en prefetch RSC). La suite principal202 PASS+4 omisiones. Los pasos posteriores
de cerrado/Preview/Google no se ejecutaron en esa CI; no acreditarlos como PASS.

`LEXORA_GOOGLE_AUTH` tiene defecto `auto` en el código de la PR; la versión
publicada todavía no reconoce esa variable. No se pudo leer un override de
Vercel: sin conector instalado, CLI autenticada ni host de navegador disponible.
Por tanto, no se afirma haber verificado un valor efectivo de entorno. El botón
ausente se explica por la implementación aún no publicada, independientemente
del retorno canónico. Siguiente trabajo de publicación: resolver WebKit y las
comprobaciones pendientes, obtener CI verde del head y verificar Production.
Q-011 conserva pendiente el acceso Google real a la misma cuenta.

**Pausa solicitada por el propietario — 2026-11-12,16:04 Madrid.** Rama local
`feat/lex-15-1-google-signin`, HEAD `45e9221`; mismo head en PR116. Calidad y
Base de datos SUCCESS en CI43242216566, E2E todavía en curso. No se ha fusionado
esta ampliación. La CI remota ya iniciada puede terminar durante la pausa.

La comprobación adicional local dio4 PASS/216 análisis Axe sin infracciones
ni incompletos. Compatibilidad dio6 PASS/2 fallos WebKit en espera de login;
el diagnóstico con traza dio1 PASS/1 fallo, todavía sin analizar. La pantalla
seguía «Entrando…» al superar5s; no se atribuye causa sin revisar la traza.
Los pases cerrado/Preview encadenados no llegaron a ejecutarse en este pase.
El código permanece sin cambios después de publicar la PR; solo este registro
de pausa queda pendiente de commit.

**Siguiente acción exacta al volver:** comprobar la CI del head, analizar la
traza sintética conservada de WebKit y resolver su demora antes de fusionar;
completar cerrado/Preview y verificar Production. El propietario hará después
de la pausa la [configuración de Google](GOOGLE_SIGN_IN.md); Q-011 sigue abierta.
No reiniciar las pruebas físicas ya confirmadas ni tocar datos reales.

**Ampliación 1.1.0 — 2026-11-12:** renovación visual y Google opcional para la
cuenta personal existente. Código `2bb9237`, publicación en
[PR116](https://github.com/JoanOliver04/lexora/pull/116), condicionada a sus tres
checks protegidos y al despliegue Production. El propietario confirma conservar
el acceso personal cerrado. No hay SQL, dependencias nuevas ni cambios de FSRS.

Gate local PASS962+1/Node12/build; regresión18 PASS y Google8 PASS, sin retries,
con32 análisis A/AA sin incidencias ni incompletos. Tres revisiones independientes
cerradas. Se corrigieron el reflow320/texto200, el selector ambiguo de formulario
y una carrera en la espera de foco de una prueba. Evidencia y límites en
[Google](evidence/LEX-15-google-sign-in.md) y [diseño](evidence/LEX-15-visual-direction.md).

**Único paso externo de esta ampliación:** Q-011, activar Google y comprobar
el acceso real a los datos existentes. El botón se detecta automáticamente
cuando Supabase habilita el proveedor. [Guía de activación](GOOGLE_SIGN_IN.md)
y [ADR-011](adrs/011-personal-google-sign-in.md). El código probado no se presenta
como consentimiento o vinculación Google real.

**Entrega: V1.0.0 personal · revisión de cierre 2026-11-12.**

El alcance personal de [ADR-008](adrs/008-personal-use.md) está implementado:
biblioteca, importación TXT/CSV, estudio FSRS con guardado confirmado,
pausa/reanudación y recuperación, progreso entre pantallas, historial,
estadísticas, preferencias, exportación/borrado propio y PWA. Interfaz ES/EN,
claro/oscuro, teclado y pantallas estrechas verificados. Registro público cerrado
en la aplicación y en Auth; la cuenta existente conserva el acceso.

La [aceptación de la entrega](evidence/LEX-1.0-personal-acceptance.md) reúne los
controles y sus límites. Los checkpoints anteriores se conservan en Git y en
los informes por tarea; ya no describen trabajo activo.

## Evidencia de cierre

- Base funcional publicada: [PR114](https://github.com/JoanOliver04/lexora/pull/114),
  head `1d9cd93`, [CI43210753351](https://github.com/JoanOliver04/lexora/actions/runs/43210753351)
  con los tres checks SUCCESS. Merge `a93db6c`, deployment7736415994 Production
  SUCCESS. Health200 app/database true; no-store, DENY/nosniff, nonce fresco por
  respuesta y strict-dynamic comprobados.
- CI funcional:198 E2E PASS+4 omisiones condicionales, Firefox/WebKit8,
  acceso cerrado4 y Preview4 PASS, sin retries; SQL592 e integración53 PASS.
- Cierre de versión: `package.json`1.0.0 y `appVersion` de exportación desde la
  misma fuente, sin cambiar el formato1. Gate local con integración:930 PASS+
  1 omisión del material privado opcional; Node12 PASS y formato/lint/tipos/
  contraste/build PASS. Cada integración exige los tres checks protegidos
  del head exacto. El procedimiento de entrega publica la etiqueta `v1.0.0`
  sobre el commit desplegado, después de verificar producción.
- [Accesibilidad](evidence/LEX-9-accessibility.md):216 análisis A/AA sin
  infracciones ni incompletos;28 pares de contraste y recorrido de teclado.
  [Compatibilidad](evidence/LEX-9-compatibility.md): contextos independientes,
  sin compartir cookies iniciales,0→1 logs después de confirmar.
- [Aceptación física](evidence/LEX-9-installation.md): el propietario confirma
  instalación y reapertura en móvil/escritorio, zoom/texto y lector móvil sin
  problemas. No se atribuyen versiones, modelo o commit que no indicó.
- Veinticuatro migraciones aplicadas;18 tablas públicas con RLS.
  Este cierre no añade SQL, dependencias o servicios. La CI reaplica desde cero
  y comprueba políticas, aislamiento y tipos generados.
- [Backup/recuperación](BACKUP_RECOVERY.md): dump real cifrado/verificado,
  privado y fuera de Git; ensayo local con Auth/TOTP/RLS e historial.
  Ninguna restauración sobre producción.

## Límites conservados

No se declara una certificación integral de WCAG, métricas de campo, SLA ni
un periodo de estabilización no acordado. El fallback no permite estudiar
offline. SMTP dedicado, Sentry, demo de captación y portfolio quedan fuera del
alcance personal; no se acredita entrega real de correo remoto.

Q-005/Q-006 mantienen abiertas sus decisiones históricas, con las opciones
actuales implementadas y probadas. La licencia sigue sin decidir. Las demás
limitaciones reales, incluido el orden parcial de mazos ante un fallo de
escritura, se explican en la aceptación y en [DATA_MODEL](DATA_MODEL.md).

## Operación y siguiente acción

Usar la app y conservar una copia externa del backup cifrado, con la clave
separada. La copia externa y la custodia de la clave corresponden al propietario;
no se ha contratado ni supuesto un destino. RPO/RTO manuales, sin garantía.

La publicación permanece en main protegida; las previews Git siguen
desactivadas y una Preview manual bloquea el backend personal. No ejecutar
reset/seed ni pruebas destructivas sobre producción. Para retomar el desarrollo,
leer este estado, comprobar Git y reproducir el fallo concreto antes de editar;
las ideas de otra versión se mantienen separadas de las correcciones.
