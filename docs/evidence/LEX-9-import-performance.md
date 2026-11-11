# Importación acotada: rendimiento y recuperación

Fecha: 2026-11-11. Rama `feat/v1-import-performance`, base `e9042ed`.
Migración aditiva `20261111194000_batched_import_jobs`, todavía solo local.
Contrato y excepción de metadatos en [ADR-010](../adrs/010-bounded-import-transactions.md).

## Medición ejecutada

Solo usuarios sintéticos en localhost:54321, eliminados en finally por UUID y
correo reservado. Sin reset de Lexora ni acceso de escritura a producción.
Ambas rutas se midieron mediante sus casos de uso y adaptadores reales; no
incluyen Auth de Next ni el salto navegador/API. El flujo nuevo incluye además
su preparación y consulta de duplicados. Perfiles de CPU del worker real,
solicitudes y resúmenes se conservan fuera del repositorio en Temp.

| Carga | Tiempo observado | HTTP a Supabase | Resultado persistido |
|---|---|---|---|
| Anterior, 1.010 filas, inversa, una etiqueta | 73,734 s; repetición perfilada 62,024 s | 5.056 | 1.010 conceptos; listado parcial de 1.000 |
| Lotes, misma carga de 1.010 filas | 1,495 s | 11: 5 preview, 1 inicio, 5 lotes | 1.010 conceptos y 2.020 ítems |
| Lotes, 10.000 filas, inversa, una etiqueta | 10,011 s | 81: 40 preview, 1 inicio, 40 lotes | 10.000 conceptos y 20.000 ítems |

Los probes posteriores encuentran el último concepto, también después del
límite de 1.000. En la ruta anterior, repetir esa fila con skip creó una copia:
la aserción falló de forma reproducible. En la nueva ruta, la regresión DB
acredita cero creadas y una omitida.

En las pasadas nuevas, el event loop p99 fue 13,47/13,12 ms y el máximo
14,56/15,05 ms. Las peticiones por lote hacen más trabajo que una escritura
individual: sus p95 fueron 385,59 ms (11 peticiones) y 503,58 ms (81). No son
percentiles de duración de un trabajo completo. RSS final 106/150 MB y delta
de heap 4,7/10,7 MB no prueban ni descartan una fuga.

Estas son observaciones locales, no benchmarks de producción, métricas de
campo ni una garantía de capacidad. No se extrapoló una pasada antigua de
10.000 filas que no se ejecutó.

## Pruebas ejecutadas hasta este punto

- Integración real local: 5 PASS. Incluye 1.010 filas, reenvío idéntico y
  alterado, dos inicios simultáneos, dos lotes simultáneos con estrategia copy,
  rechazo no-dueño/anon, progreso forjado, parada, error Unicode y rollback
  tardío después de escribir contenido. Ningún payload queda en el recibo.
- pgTAP: 565 PASS, 23 archivos. Añade privilegios/RLS, trigger privado no
  invocable ni enlazable por el cliente, reloj UTC y rechazo de backdating.
- Base desechable: 22 migraciones reales, 15 aserciones PASS, sin seed.
- Dominio/aplicación/transportes/Preview: 102 PASS en el pase dirigido.
- Primer pase de navegador: 28 PASS de 30. Archivo cercano a 5 MiB y
  recuperación de ACK perdido/reload con copy pasan en escritorio y móvil.
  Dos fallos de una prueba antigua corresponden al nuevo cooldown de 2 s;
  se actualizó para comprobar el 429 y esperar su Retry-After antes del
  reintento explícito. Pendiente el pase final con las nuevas regresiones.
- El primer gate general quedó en 896 PASS, una omisión y un timeout al
  inicializar ESLint en Windows (17,4 s frente al presupuesto de 15 s).
  La carga de plugins se movió al setup de la prueba, sin cambiar las
  aserciones ni sus timeouts. Pase dirigido de arquitectura: 17 PASS.

Verificación final local: `pnpm check` con integración habilitada termina con
exit 0, 898 PASS y una omisión prevista (117 archivos), formato/lint/tipos/
contraste/build PASS. La suite completa posterior dio 173 PASS, cuatro omisiones
condicionales y tres fallos: dos del selector de etiquetas tras reset del
formulario y uno de desconexión del fixture de actualización PWA. Se corrigió
la identidad del grupo de selectores y el fixture ahora cierra su servidor
loopback antes de comprobar el fallback, sin cambiar el worker de producción.
Pase posterior de importación/PWA: 40 PASS, cero reintentos, exit 0. Reflow con
una muestra inválida sin espacios: 2 PASS tras acotar el ajuste de texto.
Registro cerrado: 4 PASS; Preview: 4 PASS, incluida la nueva API denegada.
CI ejecutará de nuevo la suite completa sobre el commit publicado antes de merge.

Snapshot público de 622 archivos: Gitleaks 8.30.1 sin hallazgos. No se presenta
un escaneo de carpetas privadas/dependencias como escaneo del código publicable.
La comprobación de integración de importación se añade al trabajo de DB de CI;
los tres checks protegidos conservan sus nombres y requisitos.

## Revisión y correcciones

Tres lentes independientes han revisado integridad/recuperación, seguridad y
estándares. Se corrigieron cortes de pares UTF-16, doble conversión de HTML,
preparación obsoleta al sustituir archivos, fallback de columnas fuera de rango,
preservación de tags:null, salida desde un trabajo completado y foco al pausar
o finalizar. Las pruebas de navegador finales deben acreditar estas últimas
correcciones, incluida la vuelta a una biblioteca previamente visitada.

Las tres revisiones estáticas están cerradas y las regresiones dirigidas
acreditan los casos corregidos.

## Publicación verificada

PR #108, commit `f0974e6`, CI43101502071: tres trabajos SUCCESS. E2E del head:
176 PASS, cuatro omisiones privadas condicionales, sin pruebas flaky; acceso
cerrado4 PASS y Preview4 PASS. Merge `dfb98e9db399b3247de20594d8c027608e0e80a2`;
deployment7721568934 SUCCESS. M22 se aplicó desde el snapshot exacto del commit
con CI verde, excluyendo la siguiente migración local: 22 en producción,
dry-run posterior limpio, sin reset ni seed. El primer dry-run necesitó copiar
al snapshot la configuración IPv4 ya enlazada; no se cambió el proyecto destino.

Origen canónico: health5/5 HTTP200 con app/database true, API de importación
anónima401/no-store, CSP con nonces distintos, DENY/nosniff conservados. Metadata
SQL remota: RLS en ambas tablas nuevas y EXECUTE directo/anon denegado.

La configuración de región única cdg1 está publicada. Cinco peticiones health
anteriores: 2130/624/557/589/576 ms, identificadores cdg1::iad1. Posteriores:
1053/291/234/117/104 ms, cdg1::cdg1. Medianas observadas589/234 ms. La primera
incluye costes de conexión; no se atribuye a cold start. N=5 no permite afirmar
percentiles, significación estadística, tiempos de toda la app o CWV de campo.

El trabajo global de rendimiento sigue abierto para listados grandes y
bundle/laboratorio; no se declara completada toda la V1 por publicar este bloque.
