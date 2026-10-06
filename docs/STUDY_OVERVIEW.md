# Read model de Hoy

LEX-6.1 añade una consulta de estudio sin escrituras. LEX-6.2 conecta esa
consulta a la interfaz de Hoy en `/{locale}/app`. La composición
entrega los puertos `dailyQueue` y `todayOverview`, la identidad verificada, la
zona IANA del perfil y el `Clock` del servidor. El consumidor llama a
`getTodayOverview` con un único instante de ese reloj. No se cachea entre usuarios.

## Recuentos

Todos los recuentos se expresan en **ítems de práctica**, no conceptos. Las dos
direcciones de un mismo concepto cuentan por separado. Un concepto compartido
por varios mazos no duplica sus ítems.

La consulta reutiliza `loadDailyQueue`: mismos candidatos, filtros y cupos que
`getDailyQueue`, sin cargar dos veces la biblioteca. Solo admite mazos activos
del curso, conceptos activos del mismo curso e ítems activos y habilitados.
`deckIds: null` selecciona todos; `[]`, ninguno. Se excluyen también los enlaces
entre cursos distintos del mismo dueño que el esquema permite.

| Campo | Significado |
|---|---|
| `dueReviews` | Todos los ítems Review vencidos, incluidos los ocultos por el límite. |
| `availableReviews` | Review vencidos que todavía caben en el cupo diario. |
| `learningDue` | Learning y Relearning vencidos; los pasos futuros no están disponibles. |
| `newAvailable` | Nuevos que caben en el cupo diario restante, con estado o sin él. |
| `difficultItems` | Difíciles en todo el alcance elegible, aunque aún no venzan o queden ocultos. |
| `availableCount` | Tamaño de la cola disponible: aprendizaje vencido + Review disponible + nuevos disponibles. |
| `hiddenDueReviews` | Review vencidos excluidos por el límite. |
| `hiddenNew` | Nuevos elegibles excluidos por el cupo. |
| `nextDueAt` | Próximo vencimiento futuro entre los candidatos. |

Los cupos conservan la semántica de FASE 5: la actividad del dueño en su día
local consume los límites; el filtro de mazos no reinicia el cupo. Los límites
de Review no recortan los pasos cortos de aprendizaje. La ventana diaria es
medianoche local a medianoche siguiente, con fin exclusivo; soporta días de
23 y 25 horas. Una cola vacía con `hiddenDueReviews > 0` tiene trabajo vencido.

## Difíciles

`isDifficultItem` centraliza la clasificación. Un ítem cumple si acumula al
menos tres lapsos o si dos de sus tres últimos intentos son `again`. `hard`
no equivale a fallo. Las dos condiciones no duplican el recuento.

Las valoraciones se leen de más reciente a más antigua, por `reviewed_at` y,
en caso de empate, `id` descendente. No se aplica la ventana de duraciones a
esta historia: un último intento antiguo sigue contando. Se ignoran registros
posteriores al instante de consulta. Si ya hay tres lapsos no hace falta leer
valoraciones para clasificar ese ítem.

## Estimación temporal

La estimación describe **una pasada por la cola disponible**, sin predecir
cuántas veces volverán a aparecer pasos cortos ni incluir trabajo oculto.

- Muestra: hasta las 100 duraciones válidas más recientes del dueño, en los
  últimos 30 días de 24 horas, hasta el instante del servidor inclusive.
  Se comparte entre cursos y mazos: mide el ritmo del usuario.
- Válida: positiva, finita y no superior a una hora, igual al máximo del esquema.
  Nulos y ceros no aportan una medida de tiempo.
- Con al menos cinco muestras: mediana; para una cantidad par, media de las
  dos centrales. Una pausa larga afecta menos que en una media global.
- Con menos de cinco: respaldo fijo de 30 segundos por intento. Es una
  aproximación inicial, no una medición del usuario.
- `totalMs = availableCount × perReviewMs`. Una cola vacía da cero.

`estimate.source` distingue `history` de `fallback`, y `sampleSize` indica
cuántas observaciones válidas hay. La presentación deberá expresar el tiempo
como aproximado. No hay un porcentaje de nivel académico ni una predicción
FSRS mezclada con actividad observada.

## Lecturas y pruebas

Los adaptadores usan la sesión normal y RLS, con filtros explícitos de dueño.
Las lecturas completas están paginadas en bloques de 500 filas y los filtros
de identificadores se dividen en grupos de 100. No se confía en la respuesta
por defecto de PostgREST, limitada a 1.000 filas. Un error en cualquier página
se propaga como `StudyError`; no se entrega un recuento parcial como éxito.

La consulta combina varias lecturas; no constituye un snapshot transaccional.
Una revisión concurrente puede cambiar las cifras entre lecturas. La sesión
volverá a consultar la cola, y la escritura conserva su control de revisión.
La búsqueda de las tres últimas valoraciones puede recorrer historia antigua
en varios bloques; no se añade materialización sin una medición que la justifique.

Los tests de dominio y aplicación corren con `pnpm test`. El test contra
PostgREST real se activa con `LEXORA_DB_TESTS=1`; rechaza cualquier destino que
no sea `localhost` o `127.0.0.1` en el puerto 54321. Usa contenido sintético y
clientes autenticados normales, sin `service_role`. Borra solo los cursos que
creó esa ejecución y sus datos en cascada; los usuarios de Auth y sus perfiles
de prueba permanecen, como en los E2E de registro.

En PowerShell, con Supabase local arrancado:

```powershell
$env:LEXORA_DB_TESTS = '1'
pnpm test tests/unit/study/today-supabase.integration.test.ts
Remove-Item Env:LEXORA_DB_TESTS
```

La CI ejecuta esa prueba en su trabajo de base de datos. Incluye 1.101
conceptos/ítems/estados, 1.005 repasos del día, historia antigua detrás de más
de 1.000 registros recientes, filtros de archivo y curso, y aislamiento A/B/anon.

## Dashboard y actividad — LEX-6.2

`getTodayDashboard` coordina el read model de recuentos, las lecturas de mazos
y última sesión, y el resumen de actividad. La página obtiene la identidad,
zona e instante desde `getStudyContextForCurrentUser()`; no recibe un dueño ni
un reloj del navegador. El componente de servidor carga datos dentro de
Suspense; la navegación, la recuperación de errores y las traducciones
se mantienen en presentación. La página conserva la protección SSR y el
curso activo del shell anterior.

La vista distingue trabajo disponible, cupos agotados con trabajo oculto,
próximo vencimiento futuro y biblioteca sin ítems elegibles. La consulta fallida
no se sustituye por cifras a cero. El error muestra una acción de reintento;
un filtro inválido se recupera volviendo a todos los mazos. El límite de Review
y el de nuevos nunca se presentan como «todo terminado».

### Siete días

La actividad corresponde al **curso completo**, no al filtro de mazos, y lo
explica la interfaz. Incluye hoy y los seis días locales anteriores. La ventana
se recorre por medianoches IANA: una semana con un cambio horario puede tener
167 o 169 horas. No se calcula como siete bloques fijos de 24 horas.

- Repasos: todos los intentos confirmados del curso y periodo, incluidos pasos
  cortos y primeras introducciones. Se deduplican por ID de log.
- Nuevas practicadas: ítems distintos cuyo estado previo era `new`, por día.
- Tiempo registrado: suma de duraciones válidas presentes; un cero explícito
  es una medición. Se indica cuando faltan duraciones en parte de los intentos.
- Historial: se incluye la actividad de ítems o conceptos archivados, mientras
  sus filas sigan existiendo. Los logs posteriores al instante del servidor
  no se cuentan.

La consulta filtra el curso a través de las relaciones entre log, ítem y
concepto, sin depender de que exista una sesión asociada. Sigue paginada en
500 filas. Usa los índices ya existentes; no se añade tabla agregada ni caché.

### Último filtro

Se lee la última `study_sessions.scope` del mismo dueño y curso, por
`started_at DESC, id DESC`. La representación usada es `{ deckIds: null }`
para todos los mazos o `{ deckIds: [UUID, ...] }` para un subconjunto. El objeto
vacío legado representa todos. Los UUID se normalizan y deduplican; se admite
un máximo de 100 identificadores por filtro. Un array vacío conserva su
significado de «ninguno» y no produce un enlace de restauración.

`/app?deck=UUID` admite parámetros repetidos para restaurar el alcance. Cada
ID debe ser un mazo activo del curso; un ID ajeno, archivado o malformado
produce un mensaje recuperable, sin mostrar información del mazo. La vista
por defecto muestra todos los mazos y ofrece acceso al último filtro si sigue
disponible. Sin sesiones previas, se indica que aún no existe un filtro anterior.

Desde LEX-6.3, **Empezar sesión** navega al selector de alcance cuando hay
trabajo disponible y conserva el filtro de Hoy. En vacío, espera o límites
agotados permanece deshabilitado con una explicación de la disponibilidad.

### Verificación visual

La vista usa los tokens y controles existentes, textos ES/EN, fechas inglesas
`en-GB`, objetivos táctiles de 44 px o más y estructura semántica. La actividad
diaria es una lista textual accesible, sin depender del color.
`tests/e2e/today.spec.ts` comprueba datos reales, filtros, recuperación con
teclado, escritorio y Poco F5 emulado, tema oscuro y texto ampliado al 200 %.
También guarda capturas con contenido sintético en `test-results/` (ignorado).
Los tests de presentación comprueban límites, espera, respaldo de estimación
y reintento; la navegación real se verifica en Playwright.

## Alcance y creación de sesión — LEX-6.3

`/{locale}/app/study` ofrece todos los mazos activos o un subconjunto del
curso activo. El selector acepta el filtro de Hoy; elegir una casilla cambia
al modo de subconjunto. Se exige al menos un UUID válido, con máximo 100,
normalización y deduplicación. Un mazo ajeno, de otro curso o archivado recibe
el mismo error recuperable, sin revelar información del recurso.

La disponibilidad previa corresponde al curso completo y la UI lo aclara.
`createStudySession` valida los mazos y recalcula la cola elegida con
`getDailyQueue` antes de insertar. Una cola vacía no crea una sesión; cambiar
de alcance no reinicia los cupos. Estas lecturas y el insert no constituyen
una reserva transaccional: otra revisión puede cambiar la disponibilidad,
que se vuelve a consultar al abrir la sesión.

El formulario conserva un UUID de petición generado en el servidor. Repetir
el mismo curso y alcance devuelve la sesión original; un envío concurrente
que pierde la PK relee esa fila bajo RLS. Cambiar la intención con el mismo
UUID da conflicto. Los errores conservan selección e ID; un listener nativo
evita que el reset automático de formularios de React cambie los radios
durante el commit. El estado pendiente deshabilita los controles y el envío.

La Server Action obtiene identidad verificada, curso activo, zona IANA y
`Clock` de la composición. Ignora dueño, curso y fecha aportados desde el
navegador. `StudySessionRepository` usa el cliente normal: crea únicamente
la fila `active`, con `{ deckIds }`, fecha del servidor, contadores cero y
`ended_at = null`. No guarda la cola ni escribe estados de memoria o logs.

`/{locale}/app/study/{sessionId}` autoriza por dueño antes de renderizar.
Un UUID ajeno devuelve HTTP 404 real; el streaming está limitado a la carga
del selector, no a un `loading.tsx` compartido que convertiría el 404 en 200.
La página muestra fecha, alcance y disponibilidad reconstruida desde la fila
guardada. Las sesiones no activas no se reactivan. LEX-6.3 entregó la
confirmación de preparación; LEX-6.4 añade el primer frente, descrito abajo.
No hay valoraciones ni controles de ciclo de vida en estas entregas.

Las pruebas cubren reintento, carrera, límites, selección inválida, cliente
anónimo y aislamiento entre dueños. La integración local demuestra que
memoria y logs permanecen intactos; el E2E verifica el flujo ES/EN, foco tras
error, campos falsificados ignorados, recarga sin duplicar y 404 ajeno.
Evidencia completa en [`evidence/LEX-6.3.md`](evidence/LEX-6.3.md).

## Renderer de contenido — LEX-6.4

La biblioteca y la sesión comparten `PracticeItemPrompt` y `PracticeItemAnswer`
en `library/presentation`. Componentes sin estado ni dependencias de Next.js:
reciben contenido tipado y etiquetas traducidas. Reconocimiento y recuperación
conservan su dirección guardada; un cloze conserva el enunciado y sus soluciones
ordenadas. No se deduce un marcador ni se transforma el texto de los huecos.
Todo el contenido se renderiza como texto escapado de React, no como HTML,
Markdown ejecutable, enlaces, audio o scripts. Saltos de línea y palabras largas
se conservan con ajuste de línea, también con zoom.

`practiceItemContentFrom` reutiliza la validación de dominio y acepta solo
los tres modos V1. El preview conserva su `<details>` nativo y muestra la
respuesta y, para cloze, la lista de soluciones al abrirlo. Los modos
reservados no producen un preview funcional.

`getStudySessionCard` autoriza primero la sesión con `getStudySession`,
reconstruye la cola con su curso y alcance guardados, y lee únicamente el
contenido del primer ítem disponible. No elige otro ítem al fallar una lectura.
`StudyCardRepository` consulta con RLS y filtros de dueño, curso, modo V1,
ítem activo/habilitado y concepto activo; un error de lectura o configuración
inválida se propaga a la frontera de error existente, nunca se finge una cola
vacía. Si el ítem deja de estar disponible entre lecturas, la UI ofrece recargar.

La sesión recibe una proyección explícita de modo, prompt y pista. Respuesta,
soluciones, configuración completa y metadata del ítem no pasan al renderer
ni al payload del cliente. La prueba de navegador comprueba ausencia de las
soluciones tanto en el DOM como en el HTML/RSC inicial. La pista es contenido
elegido por el usuario: no se intenta detectar si contiene una respuesta.

La consulta de elegibles filtra también `V1_PRACTICE_MODES`: un modo futuro
manualmente habilitado en la base no consume cupos ni aparece en Hoy o la sesión.
No hay estado de memoria nuevo, logs, avance de tarjeta ni mutación de la sesión
al consultar contenido. Sin trabajo disponible no hay frente; no se declara
completada una sesión por esa circunstancia. LEX-6.5 añade el revelado y la
elección local de valoración, descritos abajo. El preview no es un repaso.

Pruebas en aplicación, renderer, PostgREST local y navegador verifican los tres
modos, texto adverso, aislamiento A/B/anon, archivo/desactivación, contenido
malformado, frontend sin soluciones y lecturas sin escrituras. Evidencia en
[`evidence/LEX-6.4.md`](evidence/LEX-6.4.md). No cambian esquema ni scheduler.

## Revelado y valoraciones — LEX-6.5

`StudyCardView` muestra la instrucción de intentar recordar antes de revelar,
el prompt y la pista. No monta ni recibe respuesta, soluciones, ejemplo o
explicación del concepto en el payload inicial. Los cuatro controles y sus
descripciones son visibles, pero están deshabilitados hasta un reveal válido.

El formulario invoca `revealStudyCardAction` con sesión e ítem; dueño, zona e
instante proceden del contexto verificado del servidor. La acción ignora el
estado previo y los campos adicionales del cliente. `revealStudySessionCard`
autoriza la sesión, reconstruye su cola vigente y exige que el ID solicitado
sea el primer pendiente. No permite consultar una respuesta de otro ítem
fuera de alcance ni sustituye un frente por otro. La lectura final mantiene
RLS y filtros de curso, concepto/ítem activos y modo V1.

Durante la petición se bloquea el doble envío. Un fallo deja el frente y las
valoraciones deshabilitadas; la infraestructura tiene un mensaje de reintento
sin detalles privados. Si la cola cambió, se ofrece recargar desde servidor.
La respuesta válida usa el renderer compartido; ejemplo y explicación, si
existen, también son texto escapado. El foco se mueve al heading de respuesta;
tras error, al bloque de recuperación. No se revela información por regiones
ocultas o anuncios antes del éxito. No se interpreta HTML de ningún campo.

La elección `again/hard/good/easy` conserva los valores del dominio. Cada
botón tiene una explicación visible y referenciada por `aria-describedby`,
y `aria-pressed` señala la elección sin depender solo del color. Se informa
explícitamente de que la valoración no está guardada y se pierde al recargar.
Cambiar de tarjeta o recargar reinicia reveal y elección. No hay atajos globales
ni presentación de intervalos en esta entrega.

Reveal es una lectura: no crea memoria, calcula FSRS, escribe logs o contadores,
ni avanza la cola. Desde LEX-6.6 calcula únicamente el preview del scheduler
descrito abajo. Elegir un rating solo cambia estado local de React. No existe
todavía una acción de guardar que pueda invocarse antes de revelar. La UI no
afirma que el repaso esté confirmado. La recuperación activa se solicita al
usuario; no es una comprobación automática de si realmente recordó la respuesta.

Pruebas de aplicación, acción y UI cubren autorizaciones, primer pendiente,
límites cambiados, sesión inactiva, pending/retry, selección local y foco. La
integración real y el E2E comprueban lecturas sin escrituras, payload inicial
sin contexto/soluciones, tres modos, texto seguro y rechazo al desactivar el
ítem antes de revelar. Evidencia en [`evidence/LEX-6.5.md`](evidence/LEX-6.5.md).

## Intervalos aproximados — LEX-6.6

Tras un reveal autorizado, la acción captura un único `Clock.now()` y llama a
`getRatingIntervalPreview` con el scheduler del contexto y `V1_SCHEDULER_CONFIG`,
los mismos utilizados por `reviewPracticeItem`/`confirmReview`. Lee memoria
del dueño e ítem; si no existe, crea un estado inicial hipotético en memoria,
sin `ensureLearningState`, insert, log o contador. Una versión incompatible
impide el cálculo y muestra un aviso; no hay migración implícita.

El payload incluye instante de cálculo, revisión (o nulo), flag de fuzz y
duración hasta el vencimiento por rating, no el snapshot de memoria completo.
La UI solo traduce y redondea esas duraciones; no calcula FSRS ni usa el reloj
del navegador. Cada cifra lleva `≈` y una explicación de que el intervalo al
guardar puede variar por otro instante, estado actualizado o fuzz.

El control «Mostrar intervalos aproximados» permite ocultarlos sin cambiar el
rating, solicitar otra lectura ni tocar configuración FSRS. Es un ajuste local
de esta tarjeta, reiniciado al recargar; no se simula una preferencia de cuenta
persistida. Solo aparece tras revelar. No hay todavía guardado ni avance.

El contrato real de `ts-fsrs@5.4.2` compara preview con `review` usando el mismo
estado, instante y configuración v1 con fuzz habilitado, en New, Learning,
Review y Relearning. Prueba también alta hipotética sin escrituras, versiones
incompatibles y estado original intacto. UI y E2E verifican traducción, ocultar/
mostrar y ausencia de intervalos en el frente. Evidencia en
[`evidence/LEX-6.6.md`](evidence/LEX-6.6.md).
