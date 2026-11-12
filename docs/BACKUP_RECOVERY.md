# Copias operativas y recuperación

La exportación JSON/CSV de la app es para portabilidad. No restaura Auth, SQL,
permisos ni configuración del proveedor. La recuperación operativa utiliza un
dump PostgreSQL, distinto de esas exportaciones.

## Crear la copia en este equipo

Con Node24/pnpm fijados, Docker activo y el CLI enlazado a Lexora:

```powershell
powershell -NoProfile -File scripts/backup-linked.ps1
```

El comando comprueba el proyecto enlazado y el destino ignorado por Git. Hace
lecturas de roles, esquema y datos de `public`, `auth` y `supabase_migrations`.
Compara el historial de migraciones antes y después del esquema; si cambió,
rechaza el resultado y exige repetir sin despliegues concurrentes. El dump de
datos mantiene la instantánea transaccional de PostgreSQL, permitiendo continuar
el uso ordinario de la app. No restaura ni cambia datos/configuración remotos.

Empaqueta roles/schema/data y manifest en tar.gz, cifra y verifica antes de
informar éxito. Deja `.lexorabak` y `.key` en
`docs/no_visible_en_github/backups/`, con ACL solo para el usuario actual y
SYSTEM. Borra los SQL y demás temporales al terminar, también si falla. Las
salidas finales son nuevas: no reemplazan copias existentes.

La clave es aleatoria de384bits; el formato usa scrypt(N32768/r8/p1), sal32bytes,
AES256GCM/nonce12bytes/tag16bytes, cabecera autenticada y SHA256 del payload.
Formato y versión de esquema son independientes. Lectura máxima8GiB; cabecera
máxima16KiB. Clave incorrecta, corrupción, truncamiento, versión futura o destino
existente producen rechazo. Los archivos descifrados se publican solo después
de verificar tag y checksum. La publicación por hard link en el mismo directorio
es atómica y no sobreescribe; se elimina el nombre temporal al terminar.

La copia y su clave deben guardarse fuera de este PC, en ubicaciones separadas.
El comando no realiza esa transferencia ni configura un proveedor, tarea
programada o subida automática. Una copia local protege frente a errores lógicos;
no ofrece por sí sola una copia independiente del disco.

## Qué queda fuera

No incluye secretos/configuración de Auth, claves de firma JWT, proveedor de
correo, Vercel/DNS ni objetos binarios de Storage. La app no guarda el archivo
original importado. El código y los recursos públicos siguen en Git. Los
documentos privados de diseño tampoco se copian dentro del dump.

El destino debe provisionar roles y servicios de plataforma compatibles. Los
factores MFA pueden depender de las claves/configuración de Auth: conservar SQL
no autoriza a prometer que funcione con claves distintas. Un cambio de claves
de firma exige volver a iniciar sesión; no se garantiza validez de tokens viejos.
No se eliminan columnas, filas o factores para conseguir una restauración verde.

## Recuperar en un destino aislado

1. Elegir una copia y conservarla intacta, junto con la versión compatible de
   código/migraciones y la configuración necesaria del proveedor.
2. Cargar la clave en `LEXORA_BACKUP_PASSPHRASE` sin imprimirla y descifrar a un
   directorio privado nuevo con `node scripts/backup-cli.mjs open copia.lexorabak
   payload.tar.gz VERSION_MAXIMA`. El comando no ejecuta SQL. Rechaza esquemas
   más nuevos que esa versión; no acepta JSON/CSV de la app.
3. Revisar `tar -tzf payload.tar.gz`: deben existir únicamente `roles.sql`,
   `schema.sql`, `data.sql` y `manifest.json`. Rechazar rutas absolutas, `..`,
   enlaces u otras entradas; extraer exclusivamente en ese directorio vacío.
4. Provisionar un destino Supabase nuevo compatible. Revisar roles/schema/data
   antes de aplicarlos con parada al primer error y transacción única, siguiendo
   el procedimiento del proveedor. El dump CLI separado puede requerir omitir
   triggers durante la carga de datos para no duplicar efectos; eso pertenece
   al destino aislado y al operador, no a las políticas normales de la app.
5. Comparar recuentos e integridad de las relaciones, usuarios, historial,
   progreso, migraciones, funciones y permisos. Probar login nuevo, MFA cuando
   proceda, dueño/otra cuenta/anon y los flujos críticos de la app.
6. Si el dump es anterior, ejecutar las migraciones posteriores reales en el
   staging y repetir las comprobaciones. No aplicar SQL inverso improvisado.
7. Promover el destino solo con el plan concreto y la autorización del dueño,
   conservando la instalación anterior para recuperación. No restaurar en
   producción en uso ni borrar cuentas reales para ensayar.

El cambio de destino en un servicio PostgreSQL remoto es una promoción operativa;
no equivale a renombrar un archivo SQLite. La atomicidad del artefacto y la carga
transaccional no sustituyen la decisión de corte de tráfico.

## Ensayo automático y límites

`pnpm ops:backup:test` prueba el envelope y los metadatos con fixtures hostiles.
`pnpm ops:recovery:verify` crea dos bases locales desechables, arranca Auth real
con la imagen instalada, aplica las migraciones, crea dos usuarios y un factor
TOTP, biblioteca/progreso/historial sintéticos, cifra el dump y restaura en una
base nueva. Compara el contenido de todas las tablas y prueba Auth/REST/RLS reales.
Solo elimina sus bases UUID y contenedores con la etiqueta de ese ensayo.

El ensayo utiliza un clúster local con roles de plataforma ya provisionados y
configuración Auth sintética conocida. No acredita recuperación de un sistema
operativo vacío, de un proyecto hosted con otra versión, de secretos del
proveedor ni de datos reales. La CI repite el ensayo sin credenciales hosted.

No hay tarea automática ni RPO/RTO contratado. RPO: datos posteriores al último
dump verificado pueden perderse. Los tiempos sintéticos locales de la evidencia
no son el RTO de producción; el tamaño, la conectividad y el proveedor influyen.

Fuentes consultadas el2026-11-11: [backups de Supabase](https://supabase.com/docs/guides/platform/backups)
y [restauración desde plataforma](https://supabase.com/docs/guides/self-hosting/restore-from-platform).
Supabase recomienda dumps periódicos y copias externas para Free; el dump no
incluye todos los servicios/configuración. Evidencia: [LEX-9-recovery](evidence/LEX-9-recovery.md).
