# PWA online-first y entrada accesible

Fecha: 2026-11-11. Rama `feat/v1-pwa`, base de ciclo de datos `4fdde24` ya publicada
con PR #105. Sin migraciones ni dependencias nuevas.

Implementación: manifest e iconos propios, inicio en Hoy con idioma/sesión,
instalación explícita desde ajustes y evento conservado entre rutas, registro SW
en contexto seguro, caché pública de cuatro recursos, fallback ES/EN, aviso offline
y actualización sin caché de app/datos ni colas. Controles nativos de tema con
flechas, cabecera de acceso en flujo, targets amplios y zonas seguras. Se corrige
también el wrapper de footer de Auth para evitar párrafos HTML anidados.

Ejecuciones dirigidas:

- 5 unit PASS: formatos/dimensiones reales de iconos, favicon RGBA y manifest;
  precache con credentials omit, tráfico API/RSC/POST/externo no interceptado,
  navegación privada no almacenada, 500 conservado, fallback y limpieza acotada.
- 18 E2E PWA/portada PASS, sin reintentos. Cuatro recorridos PWA ES/EN/móvil y
  escritorio: evento de instalación antes de entrar a ajustes, solo invocado al
  pulsar; actualización con script URL nuevo, caché propia vieja eliminada y ajena
  conservada, cuatro recursos exactos, API offline falla, fallback sin inputs,
  idioma correcto, reflow 320/200 y vuelta a Hoy al reconectar.
- 4 E2E de entrada pública PASS: portada, login, registro, recuperación y reset,
  ambos idiomas y proyectos; reflow, targets y tema con flechas nativas.
- Gate general final: 861 PASS + 1 omitida; tipos, lint, contraste y build PASS.
- E2E completo final: 154 PASS + 4 omisiones condicionales existentes para datos
  privados, cero reintentos. Build de registro cerrado: 4 PASS.
- Regresiones finales de arranque/tema/entrada: 12 E2E PASS; siete unit de
  sesión/proxy y tres de componente real del tema PASS.

Incidencias resueltas: PNG RGB dentro del ICO rechazado por el decoder de Next;
se genera RGBA y se añade comprobación del formato. La prueba de actualización
espera ahora también la finalización asíncrona de limpieza, además del cambio de
controller. El target de acceso corto en signup tenía menos de 44 px de ancho;
se amplió sin relajar el criterio. Sin contenido real ni proveedor de imágenes.

Revisión independiente de tres lentes sobre 43 archivos y ampliaciones: detectó
un P2 con radios nativos y almacenamiento bloqueado. Se respalda la elección en
memoria, se sincronizan radio y DOM y se prueban cambios del SO, escritura fallida,
otra pestaña y clear. Revisión incremental confirma cierre. El E2E de inicio
detectó cookie de idioma antigua: `/app` consulta solo ui_locale del perfil firmado
bajo RLS y crea una redirección local privada, con query/cookies conservadas;
las URL explícitas siguen siendo la autoridad. Tres lentes incrementales sin
otros hallazgos comunicados. Las capturas de fallback se inspeccionaron y se
acortó el titular para evitar partir palabras al 200 %.

Una pasada previa tuvo dos fallos del arranque inglés y un timeout de 5 s durante
la preparación de estudio. El arranque se corrigió; la pasada completa final dio
154+4 sin reintentos, incluidos ambos proyectos de estudio. No se cambiaron sus
timeouts ni aserciones. No se presenta la pasada previa como verde.

La instalación del E2E usa un evento simulado para comprobar el contrato de la
interfaz; no acredita instalación del sistema operativo. Q-009 física, lector
real y zoom nativo permanecen pendientes. No se declara estudio offline.
Contrato: [PWA](../PWA.md).

Publicación autorizada: PR #106, CI43076434974 con tres SUCCESS; merge
`257765f7ece53e2eb33da16536f1ebc5f3c595f7`, deployment7718366494 SUCCESS.
Health canónico200 con app/database true después del despliegue. Sin migración,
dependencia nueva o apertura del registro. La comprobación HTTP no acredita
instalación en el sistema operativo.
