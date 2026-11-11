# Historial y estadísticas

Las rutas privadas `/es/app/history` y `/es/app/statistics` tienen variantes en
inglés bajo `/en`. Usan el curso activo y la identidad verificada de la petición.
No modifican repasos, memoria ni sesiones.

## Historial

El orden es `reviewed_at DESC, id DESC`. La página solicita 41 filas y muestra
40: la fila adicional indica si existe otra página. No hay recuento global ni
offset creciente. El cursor conserva los microsegundos de PostgreSQL y el
instante superior de la primera consulta. Un repaso posterior a ese instante
no se introduce entre páginas. Los filtros inválidos se rechazan antes de leer
el historial; el cursor solo admite fechas ISO y UUID validados.

Las fechas Desde/Hasta son días del perfil, ambos inclusivos en la interfaz.
Se convierten en `[inicio de Desde, inicio del día posterior a Hasta)` en UTC.
El día del cambio horario de Madrid puede tener 23 o 25 horas. No se resta una
duración fija de 24 horas para recorrer días civiles.

Se puede filtrar por mazo, concepto, tarjeta, valoración y estado anterior. El
curso lo decide la sesión del usuario y el curso activo. Se incluye contenido
archivado. Los títulos y la pertenencia a mazos son los actuales; los estados y
vencimientos proceden de las instantáneas guardadas. Cambiar la pertenencia a un
mazo puede cambiar el resultado de un filtro histórico por mazo.

## Estadísticas

Una RPC de lectura con `SECURITY INVOKER` calcula agregados bajo las políticas
RLS existentes. No recibe un propietario del navegador: deriva `auth.uid()` y
comprueba la propiedad de curso y mazo. No crea tablas agregadas. El periodo
admite únicamente 7, 30 o 90 días civiles, incluido hoy hasta el instante del
servidor; el payload se valida antes de presentarlo. Un fallo no se representa
como una colección de ceros.

| Dato | Definición y límites |
| --- | --- |
| Repasos | Número de eventos guardados en el periodo, incluyendo todos los intentos de la misma tarjeta. |
| Valoraciones | Conteo de `again`, `hard`, `good`, `easy`; cada porcentaje usa como denominador todos los eventos del periodo. |
| Recuerdo observado | `(hard + good + easy) / total`. Sin eventos, no hay porcentaje. Es una autoevaluación observada, no un nivel MCER ni recuperabilidad predicha. |
| Minutos registrados | Suma de `duration_ms / 60000` únicamente para duraciones presentes. Se muestra la cobertura de medición; sin duraciones no se inventa tiempo. |
| Actividad diaria | Eventos agrupados por día del perfil. Los días sin eventos son cero. El gráfico muestra hasta los últimos 14 días; el resumen incluye todo el periodo. |
| Estados actuales | Ítems habilitados, de modos V1, con concepto activo y al menos un mazo activo. Sin `learning_state`, estado New. Cada ítem se cuenta una vez aunque pertenezca a varios mazos. |
| Desgloses | Tipo de concepto y nivel del contenido. Cada grupo muestra repasos del periodo y estados actuales por separado. La clasificación es la actual, también para eventos antiguos; los niveles describen el contenido, no una certificación del usuario. El filtro de mazo se aplica a ambos datos. |
| Lapsos | Suma acumulada de lapsos en esas tarjetas elegibles; no se atribuye al periodo histórico. |
| Difíciles | La misma regla de Hoy: al menos tres lapsos o dos Again entre los últimos tres eventos. Orden por lapsos, Again recientes e ID. Se muestran hasta 20 y el total completo. |
| Previsión | Vencimientos futuros de las tarjetas actuales durante siete días, incluido lo que queda de hoy. Las ya vencidas aparecen por separado. No incluye nuevas, futuras repeticiones aún desconocidas ni efectos de respuestas futuras. |
| Estimación | Una pasada por las vencidas actuales, multiplicada por la mediana de hasta 100 duraciones positivas recientes en 30 días del curso/mazo. Mínimo cinco muestras; fallback 30 segundos. Reutiliza el cálculo de dominio existente y excluye duraciones fuera de su límite de una hora. |

Los agregados se calculan en PostgreSQL: el límite de filas de PostgREST no
recorta las estadísticas. El frontend recibe sumas y conteos, no todo el
historial. Los estados presentes pueden cambiar al archivar contenido; la
actividad histórica se conserva. No se presenta recuperabilidad FSRS media.

## Presentación y verificación

Los gráficos usan tablas y medidores HTML con nombres y cifras visibles. La
información no depende del color ni necesita una biblioteca de gráficos en el
cliente. Los formularios GET, los enlaces y los detalles nativos funcionan
sin JavaScript del producto. Ver [ADR-007](adrs/ADR-007-graficos-estadisticos-html.md).

Las pruebas cubren 1.044 eventos, aislamiento A/B/anon, archivos históricos,
empates de timestamp, fechas DST y cifras calculables manualmente. Las pruebas
de navegador usan un repaso guardado por la UI y verifican después historial y
estadísticas; no sustituyen la aceptación con dispositivo o lector reales.

Los desgloses incluyen grupos con actividad antigua aunque no queden tarjetas
activas. La pertenencia a varios mazos no duplica el total del curso. Queda
completar la auditoría de fase y acreditar los gates humanos de aceptación. Esto no
certifica conformidad WCAG completa ni cierra la V1.
