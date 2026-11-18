# ADR-012 — Niveles admitidos hasta C1

**Estado:** Aceptado. **Fecha:** 2026-11-17. **Decide:** propietario, solicitud explícita.

El propietario amplía el alcance A1–B2 para incluir C1. Se conservan todos los
niveles anteriores; C2 sigue fuera del vocabulario admitido. El nivel organiza
el contenido y la selección inicial, sin certificar dominio ni bloquear estudio.
Esta ampliación no incorpora un currículo C1 precargado ni reclasifica contenido.

Se mantiene el enum existente de PostgreSQL y se añade C1 al final mediante
`20261117161352_add_c1_level.sql`, con timeout de bloqueo de5s. Cambiar ahora
todo el tipo a texto/CHECK ampliaría innecesariamente la migración. La operación
no modifica filas, RLS, índices, funciones ni permisos.

La expansión se despliega antes de la aplicación. El nuevo valor no se utiliza
dentro de la transacción que lo crea: se prueba después del commit. El backend
ampliado sigue aceptando los valores de1.1.0 mientras se publica1.2.0. Tipos
generados, validaciones de cursos/biblioteca y mensajes ES/EN se actualizan juntos.

Un valor enum no se elimina como rollback ordinario. Ante un fallo se conserva
la expansión y se corrige hacia delante; no se borran ni degradan registros C1
para volver a una aplicación anterior. La recuperación de backups conserva el
historial de migraciones y se valida en el ensayo aislado de CI.

Las pruebas cubren C1 declarado/inicial, persistencia en mazos y conceptos,
filtrado que distingue C1 de B2, rechazo de C2 y aislamiento entre cuentas.
Los dominios de cursos y biblioteca conservan sus vocabularios separados por
feature; ambos coinciden con el mismo tipo SQL.

Fuente: [PostgreSQL ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html).

## Ampliación a C2

La entrega LEX-22.3 aplica el mismo patrón con `20261118221500_add_c2_level.sql`.
C2 se añade al final del enum y se admite en onboarding, biblioteca,
filtros, estadísticas y preparación de archivos. Se conserva la decisión de
usar el nivel para clasificar contenido y elegir un punto de partida.
