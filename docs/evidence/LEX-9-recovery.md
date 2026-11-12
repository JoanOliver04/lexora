# Recuperación operativa ensayada

Fecha: 2026-11-12. Rama `feat/v1-recovery`, base posterior a PR111.
Sin migración, dependencia, servicio nuevo o restauración remota.
Contrato y procedimiento: [BACKUP_RECOVERY](../BACKUP_RECOVERY.md).

## Evidencia ejecutada

- Envelope y CLI: doce pruebas Node PASS. Bytes binarios/Unicode, metadata
  autenticada, clave incorrecta, payload/cabecera modificados, truncamiento,
  datos añadidos, formato/esquema futuro, exportación humana rechazada,
  presupuesto de metadata e inexistencia de sobreescritura/temporales residuales.
- Ensayo de recuperación real local: PASS/exit0. Auth2.197.0, PostgREST14.18,
  24 migraciones, 46 tablas con fingerprint completo idéntico tras restaurar.
  Login nuevo conserva el UUID, TOTP verificado da AAL2, historial y permisos
  se conservan, dueño lee y otra cuenta/anon no ven su concepto. RPC agregada
  funciona para el dueño y sigue denegada al anónimo.
- Restore+comparación observados5,54s; desde dump/cifrado hasta API verificada
  8,32s en ese fixture. No incluyen provisionar el proveedor ni trasladar una
  base real; no se extrapolan como RTO de producción.
- Se eliminaron exactamente las dos bases desechables y tres helpers etiquetados.
  Sin reset ni modificación de la base habitual. Los fallos iniciales del harness
  se debieron a permisos de bootstrap Auth y a eliminar el esquema public que
  el dump espera existente; se corrigió el entorno de ensayo, sin desactivar RLS.
- Se creó una copia de solo lectura de producción y se verificó su cifrado:
  historial consistente antes/después, versión20261111223000 y24 migraciones.
  SQL/tar/archivos descifrados temporales eliminados. Destino ignorado por Git,
  ACL solo usuario/SYSTEM verificada. No se publica la copia, la clave ni datos
  del usuario, y no se ha enviado nada a otro servicio.

La copia local y la clave requieren una copia física/externa separada por parte
del dueño; no se ha inventado un destino ni una política de subida automática.
La configuración y secretos del proveedor permanecen fuera del dump.

## Calidad de la prueba de importación

PR111 terminó con los tres checks SUCCESS, pero una prueba existente necesitó
un retry: Chromium había descartado el body de una respuesta429 al navegar.
Se cambió la captura a APIRequestContext antes de entregar la misma respuesta al
navegador. No se modifica la API ni su cooldown. La prueba ahora comprueba también
el formato de Retry-After. Repetición dirigida: seis PASS (tres por perfil), sin
retries. No se presenta la pasada anterior como libre de flakes.

## Publicación verificada

Gate general actualizado:921 PASS+1 omisión, doce pruebas Node adicionales,
formato/lint/tipos/contraste/build PASS, exit0. Parser PowerShell final PASS;
ningún directorio temporal de la copia real queda en Temp. Revisión completa
del diff pequeño y dependencias directas cerrada: destinos acotados, credenciales
sin logs, ACL y limpieza de recursos propios comprobadas. La CI añade Node y
recuperación local conservando los tres nombres/checks protegidos.

Reanudación2026-11-12: snapshot publicable de656 archivos, Gitleaks8.30.1
con redacción y exit0, sin secretos detectados. No se escaneó ni publicó la
carpeta privada. PR112/head4920063, CI43193476879: Calidad, Base de datos y
Extremo a extremo SUCCESS. Navegador184 PASS+4 omisiones condicionadas, sin
retries; acceso personal4 PASS y Preview4 PASS. El ensayo de recuperación también
pasó en Linux/CI. Merge6b8f31b, deployment7733865569 Production SUCCESS;
health200 con app/database true. No se añadió migración.
El backup privado ya existe y está verificado; no depende de publicar estas fuentes.
