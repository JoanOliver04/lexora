# Acceso personal

La entrega actual es de uso personal (ADR-008). No publica contacto ni contrata
SMTP o telemetría adicionales. Las cuentas existentes conservan login y la
recuperación configurada en Supabase.

## Dos barreras de registro

1. La aplicación cierra altas por defecto en `NODE_ENV=production`. No ofrece
   formulario ni enlace de registro y la composición rechaza una llamada directa
   antes de crear un cliente Auth. `LEXORA_ALLOW_REGISTRATION` es una variable de
   servidor validada: `false` fuerza cierre y `true` permite abrir explícitamente.
2. Supabase Auth tiene desactivada su opción global `enable_signup`, para impedir
   saltarse la interfaz llamando directamente a la API. No se desactiva el
   proveedor email/password, que también atiende el login de cuentas existentes.

La configuración local conserva altas sintéticas para comprobar propietarios
distintos. Playwright abre esa posibilidad explícitamente en su build habitual;
el config `playwright.personal.config.ts` la fuerza a false para probar cierre e
inicio de sesión existente por separado.

## Operación verificada en producción

El 2026-11-11 se aplicó un cambio declarativo limitado a `[auth] enable_signup =
false`, con Supabase CLI 3.1.0 ejecutada de forma aislada. El diff previo contenía
un único cambio aplicable y doce propiedades remotas no declaradas. El resultado
confirmó una sola propiedad actualizada, sin secretos enviados ni cambios en las
doce propiedades restantes. El diff posterior confirmó cero updates pendientes.

El proyecto mantiene su CLI de migraciones fijada en 2.116.0. No se hizo un push
del config local completo a producción: contiene URLs y valores de desarrollo.
El config mínimo de operación reside fuera del repo, sin credenciales. Reabrir
registros requeriría una decisión nueva y coherente en las dos barreras.

## Verificación reproducible

```powershell
$env:LEXORA_E2E_PORT='3100'
$env:LEXORA_TEST_PERSONAL_ACCESS='1'
pnpm exec playwright test --config playwright.personal.config.ts --retries=0
```

Estas pruebas solo crean cuentas sintéticas en Supabase local. Nunca ejecutan un
alta o borrado de prueba sobre la base real.
