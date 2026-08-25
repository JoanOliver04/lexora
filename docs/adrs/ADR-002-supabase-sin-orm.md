# ADR-002 — Supabase Data API con repositorios propios, sin ORM

**Estado:** Aceptado
**Fecha:** 2026-08-26
**Decide:** propietario del proyecto

## Contexto

Lexora necesita PostgreSQL, autenticación y aislamiento estricto entre usuarios.
Supabase cubre las tres cosas: base de datos gestionada, sesiones basadas en
cookies para renderizado en servidor, Row Level Security y una CLI para
desarrollo local, migraciones y pruebas de base de datos.

Queda por decidir **cómo se accede a los datos**. La opción por defecto en el
ecosistema es añadir un ORM. Merece una decisión explícita porque condiciona
dónde vive la fuente de verdad del esquema y cómo conviven las políticas de
seguridad con el código.

Dos requisitos del producto pesan especialmente:

- **La seguridad se aplica también dentro de PostgreSQL.** Cada tabla expuesta
  lleva RLS con políticas por propietario. Ocultar datos en la interfaz no basta.
- **Registrar un repaso debe ser atómico.** El nuevo estado de memoria y su
  registro histórico se escriben juntos o no se escribe ninguno, con control de
  versión para que dos dispositivos no se pisen.

## Decisión

**Sin ORM en la V1.** El acceso a datos se construye así:

1. **Migraciones SQL versionadas** en el repositorio, aplicadas con la CLI de
   Supabase. El esquema vive en SQL; ahí está la fuente de verdad.
2. **Tipos TypeScript generados desde el esquema**, regenerados tras cada
   migración. La CI falla si los tipos publicados no coinciden con las
   migraciones.
3. **Repositorios propios** que traducen filas a entidades de dominio y errores
   de infraestructura a errores internos. Ningún componente recibe una fila cruda.
4. **Operaciones atómicas complejas en funciones SQL probadas**, invocadas desde
   los repositorios. La transición de memoria se calcula en la aplicación; la
   función de base de datos verifica propiedad, versión esperada, coherencia y
   rangos antes de escribir.

Los puertos se definen por operación de negocio. No se crea un repositorio
genérico con `findAll` y `save`.

## Alternativas consideradas

**Prisma.**
Descartada. Duplica la fuente de verdad: el esquema pasa a describirse en el
lenguaje del ORM y el SQL se convierte en salida generada. Eso choca de frente
con dos cosas que aquí son centrales: las políticas RLS, que se escriben en SQL y
no tienen buena representación en el modelo del ORM, y las funciones
transaccionales, que habría que mantener aparte de todos modos. Se pagaría una
capa completa a cambio de conveniencia en las consultas simples, que son
precisamente las que menos cuestan.

**Drizzle.**
Más cercano a SQL y con menos abstracción que Prisma, y es una alternativa
razonable. Se descarta porque no resuelve el problema real —la atomicidad y la
verificación de invariantes ocurren en PostgreSQL en cualquier caso— y porque
sumar un constructor de consultas encima del cliente de Supabase añade una
dependencia más sin retirar ninguna.

**SQL directo desde componentes y rutas, sin repositorios.**
Descartada. Filtra la forma de las tablas a la interfaz, hace imposible probar
los casos de uso sin base de datos y contradice la regla de dependencia de
[ADR-001](ADR-001-monolito-modular-clean-architecture.md).

## Consecuencias

**A favor:**

- El esquema, las restricciones, los índices y las políticas de seguridad se leen
  en un solo sitio y en un solo lenguaje.
- RLS es ciudadano de primera clase, no un añadido que hay que hacer encajar.
- Menos dependencias y menos capas entre la aplicación y la base de datos.
- Obliga a entender el modelo relacional en lugar de delegarlo, lo que era un
  objetivo explícito del proyecto.

**En contra, y aceptado:**

- Hay que escribir SQL a mano, incluidas las migraciones de cambio de esquema.
- Los tipos generados son un artefacto que puede quedar desincronizado; se
  mitiga verificándolo en la CI.
- Las consultas relacionales complejas requieren más trabajo que con un ORM.
- Menor portabilidad: el código queda ligado a PostgreSQL y a las convenciones de
  Supabase. Se acepta; migrar de base de datos no está en el horizonte.

## Cómo se verifica

- Una base de datos limpia aplica todas las migraciones y los datos semilla sin intervención manual.
- Pruebas de base de datos que comprueban el aislamiento entre dos usuarios distintos.
- La CI detecta cualquier desalineación entre el esquema y los tipos generados.
- Ningún componente de interfaz importa el cliente de base de datos directamente.

## Cuándo reabrir esta decisión

- Si el número de consultas relacionales complejas hace que el mantenimiento manual cueste más de lo que ahorra.
- Si aparece la necesidad de soportar otro motor de base de datos.
- Si el mapeo manual entre filas y entidades se convierte en fuente recurrente de errores.

Cualquiera de esos casos exige un ADR nuevo, no un cambio silencioso.
