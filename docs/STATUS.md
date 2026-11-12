# Lexora — Estado actual

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
