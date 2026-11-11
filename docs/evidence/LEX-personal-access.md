# Cierre del registro para uso personal

Fecha: 2026-11-11. Rama: `feat/v1-personal-access`.

Instrucción de Joan: app para él solo por ahora, sin contacto ni nuevo correo.
Supabase Auth: un cambio aplicado en `auth.enable_signup`, doce propiedades
remotas conservadas, cero updates pendientes después. No se borraron cuentas,
seeds o datos y no se cambió el plan.

La app cierra altas por defecto en producción, elimina el formulario/enlace y
deniega el caso directo de servidor antes de contactar Auth. ES/EN y enlace a
«Abrir mi espacio» para la cuenta autenticada; portada actualizada a uso personal.
No se cambia el login ni la recuperación existentes.

- Gate general: 799 PASS + 1 omitida, tipos/lint/contraste/build PASS.
- Política y composición: producción cerrada, override explícito y ninguna
  invocación de Auth ante una acción de registro cerrada.
- Build cerrado: 4 E2E PASS (ES/EN, escritorio/móvil), sin reintentos. Verifica
  ausencia de formulario y enlace, login de cuenta sintética existente y acceso
  al área autenticada. Solo base local.
- E2E general con altas sintéticas explícitas: 134 PASS + 4 omisiones
  condicionales existentes, cero reintentos.
- No hay migración ni dependencia nueva en la app.

Contrato operativo: [PERSONAL_ACCESS](../PERSONAL_ACCESS.md).

Publicación: PR #103, tres checks SUCCESS en CI 43046555453, merge `c80847d`.
Deployment 7714079011 SUCCESS. `/en/signup` devuelve 200, contiene «Personal
access» y no contiene input de email; `/api/health` devuelve 200 con app/database
true. No se han usado credenciales ni se ha creado una cuenta real de prueba.
