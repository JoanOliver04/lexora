# Exportación JSON/CSV e integridad de descarga

Fecha: 2026-11-11. Rama: `feat/v1-data-export`, base publicada `c80847d`.
Migración `20261111151533_account_data_export.sql`, exclusivamente local por ahora.

## Implementación

Puerto/caso de uso, adaptador INVOKER y raíz de composición separados de la ruta.
La API de cookies exige mismo origen y entrada estricta/acotada. La lectura aplica
RLS sobre quince entidades, conserva archivados y todos los eventos, valida tamaño
antes de agregar y no copia Auth. Cooldown persistente con lock/trigger y permisos
que impiden borrar o backdatear la solicitud. Se conserva también al rechazar tamaño.

JSON versionado y checksum; CSV con quoting RFC, BOM UTF-8 y neutralización de
fórmulas. Streaming acotado, sin caché y attachment. Cliente con cancelación,
feedback, comprobación de bytes/hash y publicación de descarga solo tras verificarse.
No se añade dependencia, proveedor ni almacenamiento de snapshots.

## Verificación ejecutada

- Gate general final: 835 PASS + 1 omitida; tipos, lint, contraste y build PASS.
- pgTAP: 21 archivos / 516 aserciones PASS.
- Migraciones desde cero sin seed: 20, 15 aserciones PASS.
- Pruebas reales: un único ganador de exportación concurrente; 1.003 eventos sin
  corte, archivados incluidos; A/B/anon; rechazo completo de más de 16 MiB y
  cooldown posterior; sin modificaciones del historial.
- Artefactos: null/vacío, números canónicos, microsegundos/DST, comillas, CRLF,
  apóstrofes, emoji y RTL; chunks sin partir surrogate pairs; CSV leído por parser
  real. Respuestas corta, excesiva, alterada y cancelada no publican archivo.
- E2E finales de JSON >5 MiB y CSV seguro, respuesta corrupta y cooldown:
  4 PASS, español/inglés y móvil/escritorio, sin reintentos.

Revisión independiente de tres lentes, 27 archivos: corrección y estándares
detectaron pérdida de claves `__proto__` por el clon de Zod y de precisión numérica
por el parse previo del SDK. Se cambió la frontera a payload textual, validación
sin clon y números con lexemas nativos de Node 24. Regresiones de ambas pérdidas,
enteros/decimales, fakeRaw y base real: 36 pruebas dirigidas PASS. La revisión
incremental confirmó cierre de ambos hallazgos; seguridad no encontró una vía
de inyección/prototype pollution. No se añadieron dependencias.

Una ejecución local tuvo timeout de arranque de worker y otra del primer caso
ESLint bajo concurrencia. Se acota Vitest a dos workers, sin cambiar aserciones,
reintentos, tests omitidos o timeouts. Gate general, pgTAP, migraciones sin seed
y E2E dirigidos se han ejecutado de nuevo tras la corrección y pasan.

El E2E completo previo al ajuste de fidelidad dio 138 PASS + 4 omisiones
condicionales existentes, y el build de acceso personal cerrado dio 4 PASS.
CI volverá a ejecutar ambos sobre el commit publicado.

LibreOffice 26.2.4.2 importó el CSV descargado por el navegador a XLSX mediante
su CLI headless y un perfil temporal aislado: 6 filas, 19 columnas, cero celdas
de fórmula; título neutralizado, comillas, saltos, árabe/emoji, `raw_json`,
`__proto__`, entero grande y decimal preciso conservados. Se inspeccionó el XML
del XLSX. Control positivo con `=1+1`, evaluación de fórmulas activada y campos
entrecomillados no forzados a texto: fórmula presente, valor 2. SHA-256 del CSV
sintético: `786a3c4e1c7f6842b9fffe60449182c9272b7bd083abc13156fba55ba1c9986d`.
No equivale a revisión visual de Excel. No se han descargado datos reales ni se
afirma recuperación automática.

Contrato: [DATA_EXPORT](../DATA_EXPORT.md).
