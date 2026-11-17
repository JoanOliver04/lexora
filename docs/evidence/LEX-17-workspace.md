# LEX-17.1 — navegación y biblioteca

Fecha: 2026-11-17. Versión1.3.0, base `7d1ecb5` (1.2.0). Mejoras de uso diario
para la entrega personal, manteniendo la identidad visual y el registro cerrado.

## Cambios

- Accesos rápidos desde la barra o Ctrl/Cmd+K: búsqueda local de secciones y
  acciones traducidas, insensible a acentos, sin peticiones de búsqueda ni
  persistencia de texto. Diálogo nativo con Tab, Escape y foco restituido.
- Navegación y panel reutilizan el mismo catálogo de destinos. Se conserva
  `prefetch=false` por defecto para las rutas privadas, incluida la regresión
  de compatibilidad de1.1.0. No se cambia la puerta de autenticación.
- Biblioteca con jerarquía visual, controles adaptables, recuentos, filtros
  removibles y creación directa. Lista/formulario se colocan lado a lado en
  pantallas amplias y se apilan en móvil. Los formularios de filtros siguen GET.
- Paginación compartida y estados vacíos con una acción. Los contadores usan
  el recuento exacto consultado, sin estimaciones ni objetivos inventados.
- Hoy ofrece accesos para añadir un concepto, organizar mazos e importar.
- Archivo/restauración/orden reutilizan PendingButton con variantes opcionales;
  espera y bloqueo por formulario, conservando el aspecto anterior en Auth.
  La fila no desaparece antes de recibir la confirmación del servidor.

## Correcciones reproducidas

Antes del cambio, `q=missing&q=ignored` causó HTTP500 en ambos idiomas al usar
trim sobre un array. El primer valor ahora prevalece como en URLSearchParams;
la búsqueda queda acotada a200 caracteres, escapada normalmente por React.
Se rechazan números de página parciales, negativos y offsets no seguros.

Una URL fuera del total provocó PGRST103. Su integración falló primero con ese
código. El adaptador recupera únicamente el recuento mediante HEAD, con los
mismos filtros de dueño/curso/archivo/texto/tipo/nivel y RLS; el resultado de
esa página sigue vacío. La pantalla dirige al último número válido conservando
filtros. Solo se hace la lectura adicional para ese error de rango; las demás
excepciones siguen propagándose. No hay descargas sin límite ni N+1 nuevos.

La integración comprueba los recuentos exactos filtrados (1 mazo y100 conceptos),
un filtro sin resultados y una cuenta ajena sin acceso a esos recuentos.

## Verificación local

- Rojo inicial E2E:2 fallos HTTP500 (ES/EN). Regresión de rango:1 fallo PGRST103.
- Dominio de query y regresión de dashboard:12 PASS. Integración de biblioteca:
  7 PASS sobre el backend local y fixtures sintéticas con limpieza acotada.
- Pantallas:16 PASS sin retries (ES/EN×escritorio/Poco F5). Incluyen C1/B2 y
  contadores exactos; parámetros repetidos/paginación/filtros; teclado/foco y
  borrador conservado al abrir/cerrar el panel; archivo retenido en espera de
  la respuesta real, botón ocupado/deshabilitado y confirmación posterior.
- Axe y teclado, temas claro/oscuro, reflow320/texto200%; el panel se comprueba
  además con viewport320×480/texto200%, incluido el título de la acción visible.
  Se adaptó el helper de teclado a la inercia nativa de showModal, que no añade
  un atributo inert al resto del DOM. No se omiten controles dentro del diálogo.
- Capturas sintéticas revisadas; sin datos reales ni credenciales. La evidencia
  automatizada no equivale a una nueva prueba con un dispositivo/lector físico.

Tras el ajuste final de ciclo de vida y lint de React:8 recorridos de interacción
PASS (incluida carga retenida de scripts), y8 recorridos de compatibilidad
Firefox/WebKit×claro/oscuro×ES/EN PASS. Todos sin retries. La suite SQL local dio
603 PASS/26 archivos. `LEXORA_DB_TESTS=1 pnpm check` exit0:970 PASS+1 omisión
privada en129 archivos; Nodebackup12 PASS; formato/lint/tipos/28 contrastes/build
PASS. El primer gate se detuvo en lint de un script local de verificación de la
entrega anterior; se corrigió ese helper ignorado y se repitió el gate completo.

Tres lentes independientes revisaron el snapshot de27 archivos, dependencias
críticas, historia de las guardas y las tres imágenes sintéticas. Sin hallazgos
accionables demostrados. Revisión estática: no ejecutaron suites ni producción.
Gitleaks8.30.1 sobre708 archivos públicos: sin fugas, exit0; no se incluyeron
archivos ignorados, secretos o backups en el snapshot. Los cambios posteriores
a esa revisión solo completan estos resultados documentales.

La publicación requiere los tres checks protegidos del head exacto; la PR
conserva sus ejecuciones, resultado de recuperación y despliegue Production.
La primera ejecución se detuvo en auditoría por un aviso upstream sin parche;
su [análisis y excepción limitada](LEX-17-dependency-review.md) se registra por
separado. Los resultados del nuevo head, incluidos sus controles adicionales,
deben estar verdes antes de publicar.

El diagnóstico de WebKit detectó una carrera de inicio del atajo: un evento
Ctrl+K válido llegó antes del listener, aunque el control ya parecía habilitado.
Un snapshot genérico de hidratación no bastó. La disponibilidad ahora sigue
la suscripción que instala/retira el listener, con limpieza al desmontar.
Se retiró la instrumentación temporal; no se añadieron sleeps ni se ampliaron
timeouts. El caso afectado dio4 PASS con repeat-each2 y retries0 tras corregirlo.
La regresión retrasa los scripts para comprobar la indisponibilidad inicial,
la navegación visible sin ese código y la activación posterior del control.

## Coste de salida estática

Comparación de todos los chunks estáticos de dos builds de producción locales:
JS970108→974496 bytes (+4388), CSS46294→54487 (+8193). Son tamaños totales de
salida sin comprimir, no una medición del JS inicial ni de Core Web Vitals.
No se añadieron paquetes, consultas de búsqueda de accesos ni cachés privadas.

Referencia del comportamiento nativo:
[MDN showModal](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal).

## Capturas sintéticas

[Biblioteca en escritorio](lex17/concepts-desktop.png),
[biblioteca en móvil](lex17/concepts-mobile.png) y
[accesos rápidos](lex17/commands-desktop.png). Los ejemplos son originales de
los tests locales. La captura móvil es de página completa; la barra fija se
representa en la posición del primer viewport.
