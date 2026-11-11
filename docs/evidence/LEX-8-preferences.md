# Preferencias persistentes y cupos por curso

Fecha: 2026-11-11. Rama: `feat/v1-persistent-preferences`.

## Implementación

Modelo, casos de uso, adaptador Supabase y composición separados. Pantalla ES/EN
con validación de campos, foco de error, feedback, pending, recarga de conflictos
y estados de carga/error. El cambio de curso está separado del guardado general.
Se integra el tema persistido en el layout privado y la visibilidad inicial de
intervalos en el estudio. Los parámetros internos del scheduler no se exponen.

Migración aditiva `20261111142539_persistent_preferences.sql`: una columna y dos
RPC INVOKER, sin reescribir ni borrar datos. Versiones exactas de perfil/ajustes,
lock de filas y rollback completo frente a conflictos. Curso propio activo y
permisos mínimos. La configuración de cursos conserva sus valores anteriores.

La prueba real detectó reintentos de PostgREST al usar `40001` para un conflicto
de edición. Se corrigió a `PT409`; se mantuvieron aserciones y timeouts. La suite
pasó entonces en menos de tres segundos, incluido un único ganador concurrente.

Al habilitar cambio de curso se detectó un consumo diario agregado por cuenta.
Se añade curso al puerto y al filtro SQL de actividad, conservando paginación,
ventanas IANA y eventos archivados. La prueba real diferencia dos cursos y los
días de Madrid/Nueva York para los mismos eventos UTC.

## Verificación

- `LEXORA_DB_TESTS=1 pnpm check`: 792 PASS + 1 omitida, tipos/lint/contraste/build PASS.
- E2E dirigido: 4 PASS en escritorio/móvil, ES/EN.
- E2E completo: 134 PASS + 4 omitidas condicionales existentes, sin reintentos.
  Incluye conflicto entre pestañas, contexto sin localStorage, curso con límites
  distintos, preview oculto, cambio de idioma y layout a 320 px / texto al 200 %.

- pgTAP: 20 archivos / 506 aserciones PASS.
- Catálogo desde cero: 19 migraciones / 15 aserciones PASS; sin seed.
- Primera suite dirigida: 28 PASS; añadida después regresión de cupos por curso.
- `pnpm audit`: cero avisos en todas las severidades, incluido desarrollo.

Este bloque está local, sin aplicar su migración a producción. No acredita
aceptación física ni cierra Q-009. Detalle del contrato: [PREFERENCES](../PREFERENCES.md).
