# Lexora — Estado actual

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
