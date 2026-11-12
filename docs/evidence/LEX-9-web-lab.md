# Bundle y laboratorio web

Fecha: 2026-11-11. Base `3d795f7`; ajuste local de navegación de Hoy.
Herramienta reproducible: [measure-web-lab.mjs](../../scripts/measure-web-lab.mjs).
Artefactos completos privados en Temp, incluida atribución de layout shifts.

## Condiciones

Build de producción, Next16.4.6, Node24.19.0, Chromium151.0.7922.34 en Windows.
App localhost:3100 y Supabase localhost:54321. Cuenta, curso, veinte conceptos
e ítems y sesión sintéticos, eliminados al terminar. Sin carga sobre producción.
Tres cargas por ruta y perfil, contexto nuevo, caché desactivada, CPU4x, latencia
40ms, bajada1,6Mbps/subida750kbps y ventana final de observación de dos segundos.
Desktop1440×900/en/claro y viewport móvil393×873/es/oscuro. El viewport móvil
no convierte al PC en un teléfono físico.

## Observaciones finales

| Ruta | Mediana LCP desktop/ms | Máximo desktop/ms | Mediana móvil/ms | Máximo móvil/ms | JS codificado observado/bytes |
|---|---:|---:|---:|---:|---:|
| Login | 472 | 488 | 444 | 544 | 156386 |
| Hoy | 984 | 2124 | 644 | 720 | 181416 |
| Conceptos | 872 | 1640 | 624 | 628 | 156851 |
| Importar | 992 | 1236 | 544 | 548 | 203561 |
| Estadísticas | 1456 | 3068 | 680 | 696 | 166875 |
| Sesión | 852 | 1972 | 628 | 664 | 203561 |

CLS0 en las treinta y seis cargas. Las tareas más largas observadas por perfil
y ruta estuvieron entre218 y417ms bajo CPU4x; no se afirma ausencia de trabajo
que bloquee el hilo principal. El máximo desktop de estadísticas supera2,5s.
N=3 no permite percentiles de población ni garantiza futuras cargas.

Los bytes de JS provienen de Resource Timing y abarcan lo descargado durante
la ventana, incluidos prefetches visibles; no son exclusivamente JS crítico.
El build contiene39 chunks estáticos:378807bytes gzip sumados. Esa suma incluye
rutas diferentes y no se presenta como coste de una página. El mayor chunk es
71737bytes gzip. No se ha añadido una biblioteca de gráficos: los paneles usan
HTML según ADR-007. La preparación/importación pesada permanece en su ruta.

Cinco guardados reales de repaso, HTTP200 y cinco logs comprobados en PostgreSQL:
553/534/528/516/507ms (redondeados). Mediana528ms. Estos cinco clics se midieron
sin el throttle de red/CPU aplicado a las cargas; no son INP ni latencias de campo.
Los contratos de timeout/desconexión/idempotencia siguen acreditados por los E2E
de estudio. No hay un volumen suficiente de usuarios para declarar CWV de campo.

## Corrección del salto de navegación

Una pasada previa detectó CLS0,1013 en dos cargas móviles de Hoy. Se reprodujo
con un servidor diagnóstico separado que retrasa700ms las lecturas locales de
learning_states/review_logs/study_sessions, sin cambiar la app ni sus datos reales.
Las seis cargas diagnósticas anteriores produjeron CLS0,0165 desktop/0,1013 móvil.
El observer atribuyó el desplazamiento al NAV: estaba bajo el fallback de Suspense
y salía del viewport al llegar el resumen. Los accesos se colocaron antes del
resumen; las seis cargas equivalentes posteriores dieron CLS0, además de las
treinta y seis cargas finales sin retraso artificial. Se conserva el streaming
y no se introduce una consulta adicional.

## Incidencias del probe

La primera ejecución usó un nombre incorrecto de botón y no acabó la fase de
guardados. La siguiente conservó lecturas válidas pero rechazó los guardados:
el build se había compilado para el origen3000. Se reconstruyó para3100 y el
probe ahora comprueba el contrato de origen antes de crear fixtures. El pase
final termina con exit0 y cinco logs confirmados. No se atribuyen guardados a
ninguna de las pasadas fallidas.

## Reproducción

Compilar y arrancar el servidor con `NEXT_PUBLIC_SITE_URL=http://localhost:3100`
y `LEXORA_ALLOW_REGISTRATION=true` exclusivamente en local. Con ese servidor
activo, ejecutar `node scripts/measure-web-lab.mjs`. El script exige Supabase
loopback:54321, acota el origen de la app a localhost3100/3102, guarda artefactos
fuera del repositorio y limpia únicamente su usuario por UUID y correo reservado.
`--dashboard-only` permite repetir las seis cargas de Hoy sin guardar repasos.

Gate general final: 921 PASS+1 omisión en122 archivos; formato/lint/tipos/
contraste/build PASS, exit0. Regresiones de Hoy y guardado de estudio: ocho
E2E PASS, sin retries, exit0. Capturas de Hoy móvil ES/claro y desktop EN/oscuro
inspeccionadas; accesos y paneles sin solapamientos. Revisión completa del pequeño
diff y dependencias directas cerrada. Sin migración ni dependencia nueva.
Pendientes CI protegida y publicación de la corrección de navegación.
Snapshot indexado de648 archivos/3,16MB: Gitleaks8.30.1 sin hallazgos, exit0.
Excluye los borradores de backup no incluidos en este commit.

Publicación verificada el2026-11-12: PR111, CI43116849776 con los tres trabajos
SUCCESS. Navegador183 PASS+1 flaky+4 omisiones; el retry fue una captura de body
429 de una prueba de importación, registrada y estabilizada en el siguiente
bloque de recuperación (seis repeticiones dirigidas PASS). Cerrado4 y Preview4.
Merge `e45e3dc7d36ce52c6935746aa9b0a5d5e2a3a372`, deployment7723705717 Production
SUCCESS; health200 app/database true. Sin SQL nuevo. No se declara esa pasada
de CI libre de retries.
