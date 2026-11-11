# Biblioteca grande: recuentos y páginas reales

Fecha: 2026-11-11. Rama `feat/v1-library-scale`, base `dfb98e9`.
Migración aditiva `20261111212500_library_read_pages`, exclusivamente local
en este checkpoint. Producción conserva las veintidós migraciones de PR #108.
Contrato: [lecturas de biblioteca](../LIBRARY_PAGINATION.md).

## Cambio comprobable

El recuento anterior descargaba relaciones sujetas al límite de mil filas y el
detalle intentaba cargar conceptos completos para construir sus listas. Ahora
los recuentos se agregan en SQL y las dos listas ofrecen búsqueda y paginación
independientes. La asociación por nombre de etiqueta deja de buscar en un
catálogo truncado y ejecuta creación/asociación en una sola transacción.

## Evidencia local

- Gate general: formato, lint, tipos, contraste y build PASS; 911 tests PASS y
  una omisión prevista en 120 archivos. Integración habilitada.
- Integración real con PostgREST: cinco casos PASS. Dos cuentas sintéticas,
  2.020 conceptos, 1.010 miembros, 1.010 candidatos y 1.005 etiquetas. Recuento
  exacto, búsqueda de la última entrada, página 51, límites, reajuste de página,
  aislamiento A/B, anon denegado, nombre repetido y carrera de asociación.
- pgTAP: 583 aserciones PASS en 24 archivos. Las dieciocho nuevas comprueban
  privilegios, INVOKER, identidad y rollback tardío: un trigger de prueba falla
  después de insertar la relación y no sobrevive ni etiqueta ni asociación.
  Trigger, fixtures y demás cambios de esa prueba se revierten al terminar.
- Replay desde base desechable: 23 migraciones reales, quince aserciones PASS,
  sin seed. No se reinició ni se borró la base de desarrollo o producción.
- Navegador final: dieciséis casos PASS, ES/EN y escritorio/móvil, sin retries.
  Incluye biblioteca grande y operaciones de conceptos/etiquetas. Las pruebas
  previas de mazos también pasaron. Comprueba veinte filas/opciones, segunda
  página, búsquedas posteriores a mil, vincular/desvincular conservando filtros,
  URLs repetidas/obsoletas y texto al 200 % sin desbordamiento horizontal.

El primer pase tuvo cuatro fallos del localizador nuevo: formulario e input
compartían nombre accesible. Se corrigió la prueba para localizar el `searchbox`
por su rol. No se alteró el comportamiento de producción para obtener el verde.
Solo se usaron datos sintéticos locales, eliminados por identificadores propios.

## Revisión

Tres revisiones independientes de corrección, seguridad y estándares cerradas.
Se amplió el presupuesto de vuelta de 2.048 a 4.096 caracteres para preservar dos
búsquedas Unicode válidas; prueba positiva con CJK y negativa de exceso PASS.
Sin hallazgos introducidos pendientes. Las revisiones fueron estáticas, no
sustituyen las ejecuciones de pruebas descritas arriba.

Snapshot de 634 archivos publicables, incluidos los nuevos y excluidos los
ignorados: Gitleaks 8.30.1 sin hallazgos (3,09 MB, exit 0).

No se afirma integridad global entre cursos para relaciones históricas ni se
presentan estos resultados como métricas de campo o de toda la aplicación.
LEX-9.5 sigue en curso para las variantes restantes, bundle y laboratorio.

## Publicación verificada

PR #109, commit `fb3b7a4`, CI43109315353 con los tres trabajos SUCCESS.
Navegador del head: 180 PASS y cuatro omisiones condicionales; acceso cerrado
cuatro PASS y Preview cuatro PASS. Merge `154a8497305bea8905edfd42416f6518a4595097`,
deployment7722591334 Production SUCCESS.

M23 se aplicó desde un snapshot exacto de ese head, sin incluir M24, que ya
existía exclusivamente en local. Dry-run previo de una única migración;
posterior limpio. Metadata remota confirma veintitrés migraciones y las tres
funciones INVOKER sin EXECUTE anónimo. Health HTTP200 con app/database true;
login200, CSP distinto entre respuestas, no-store y DENY conservados.
