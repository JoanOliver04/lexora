# Arquitectura

Cómo está organizado el código de Lexora y por qué. Las decisiones que hay detrás
están en [ADR-001](adrs/ADR-001-monolito-modular-clean-architecture.md) y
[ADR-002](adrs/ADR-002-supabase-sin-orm.md).

> **Estado:** documento vivo. Las secciones marcadas como *pendiente* se
> completarán cuando la fase correspondiente las implemente. Hoy el proyecto está
> en fase 0: la estructura descrita aquí es la que se va a construir, no la que
> ya existe.

## Estilo

Un único despliegue —la aplicación Next.js— organizado internamente como
**monolito modular** con separación de capas y organización **feature-first**.

No hay servicios separados, ni un segundo backend, ni base de datos por módulo.
Hay límites internos que se respetan.

## Capas y regla de dependencia

Las dependencias apuntan siempre hacia dentro. Nunca al revés.

```
presentation  ──────────►  application  ──────────►  domain
                                ▲                       ▲
                                │                       │
infrastructure ─────────────────┘───────────────────────┘
```

| Capa | Contiene | Puede importar |
|---|---|---|
| `domain` | Entidades, *value objects*, invariantes, enumeraciones de estado, errores de negocio. Lógica pura, sin entrada ni salida. | Nada |
| `application` | Casos de uso, comandos y consultas, definición de puertos, autorización contextual, DTOs internos. | `domain` |
| `infrastructure` | Clientes de base de datos, repositorios, adaptador de repetición espaciada, parser de archivos, observabilidad. | `domain`, `application` |
| `presentation` | Rutas, Server Components, Client Components, Server Actions, Route Handlers, formularios, traducciones. | `application` |

**La regla que importa:** `domain` no importa React, Next.js, el cliente de
Supabase, Vercel ni `ts-fsrs`. Si lo hiciera, la lógica dejaría de poder probarse
sin levantar media aplicación.

**Y está comprobada por ESLint, no solo escrita aquí.** El bloque de
`no-restricted-imports` de `eslint.config.mjs` hace que una importación prohibida
falle el lint, y con él `pnpm check` y la CI. Cada mensaje de error explica el
porqué y remite al ADR correspondiente.

**Y la regla, a su vez, tiene su propio test.**
`tests/unit/architecture/layer-rules.test.ts` ejecuta ESLint sobre código que la
viola y exige que falle, de modo que desactivarla por descuido rompe la suite en
lugar de pasar inadvertido.

Corolario práctico: ninguna Server Action ni Route Handler contiene reglas de
negocio ni consultas SQL. Llaman a un caso de uso.

## Módulos de negocio

Se organiza por área de negocio, no por tipo de archivo.

| Módulo | Responsabilidad |
|---|---|
| `identity` | Autenticación, perfil y sesión. |
| `courses` | Idiomas, cursos y configuración educativa. |
| `library` | Mazos, conceptos, ítems de práctica y etiquetas. |
| `importing` | Previsualización, validación e importación de archivos. |
| `study` | Cola diaria, sesiones, repetición espaciada, valoraciones e historial. |
| `analytics` | Consultas y estadísticas. |
| `settings` | Preferencias, exportación y eliminación de datos. |
| `demo` | Experiencia pública sin registro. |

Un módulo trivial no está obligado a tener las cuatro capas. La regla de
dependencia sí es obligatoria siempre.

## Estructura de carpetas

```text
src/
  app/                      Rutas de App Router
    [locale]/
      (public)/             Landing y demo
      (auth)/               Registro, login, recuperación
      (app)/                Aplicación autenticada
    api/                    Route Handlers
  modules/
    identity/
      domain/
      application/
      infrastructure/
      presentation/
    courses/
    library/
    importing/
    study/
    analytics/
    settings/
    demo/
  shared/
    domain/
    application/
    infrastructure/
      supabase/
      observability/
    presentation/
      components/
      styles/
  i18n/
  env/

supabase/
  migrations/
  tests/
  seed.sql

tests/
  e2e/
  fixtures/
```

Las carpetas de cada módulo **se crean cuando el módulo se implementa**, no por
anticipado: un árbol de directorios vacíos no es arquitectura, y contradiría el
criterio de no repetir las cuatro capas en módulos triviales. La convención está
documentada en `src/modules/README.md` y `src/shared/README.md`.

## Puertos principales

La capa de aplicación depende de puertos; la infraestructura los implementa.
Cada puerto expresa operaciones del negocio: **no** hay un repositorio genérico
con `findAll` y `save`.

**Repositorios:** `UserRepository`, `CourseRepository`, `DeckRepository`,
`ConceptRepository`, `PracticeItemRepository`, `LearningStateRepository`,
`ReviewLogRepository`, `StudySessionRepository`, `ImportRepository`.

**Servicios:** `SpacedRepetitionScheduler`, `Clock`, `IdGenerator`,
`DelimitedFileParser`, `UnitOfWork` / `ReviewCommitter`, `Telemetry`.

Dos de ellos existen por motivos concretos:

- **`SpacedRepetitionScheduler`** aísla `ts-fsrs`. Si la librería cambia su API,
  el resto del producto no se entera. Ver [ADR-003](adrs/ADR-003-fsrs-programa-practice-item.md).
- **`Clock`** existe porque el comportamiento depende del tiempo y `new Date()`
  repartido por el código hace imposible probar medianoche, cambios de hora y
  vencimientos. El reloj se inyecta siempre.

## Server Components, Client Components y mutaciones

| Herramienta | Cuándo |
|---|---|
| Server Component | Por defecto: páginas, cargas iniciales, consultas privadas. |
| Client Component | Solo con interacción, estado local, API del navegador o gráficos. |
| Server Action | Mutaciones internas iniciadas por formularios. Delgadas. |
| Route Handler | Importación y exportación, *callbacks*, cualquier cosa que necesite contrato HTTP. |

Los datos privados de un usuario nunca entran en cachés compartidas.

## Acceso a datos

Sin ORM. El esquema vive en migraciones SQL versionadas; los tipos se generan
desde el esquema; los repositorios traducen filas a entidades y errores de
infraestructura a errores internos.

Las operaciones que deben ser atómicas —registrar un repaso, por ejemplo— se
encapsulan en funciones SQL probadas. El razonamiento completo está en
[ADR-002](adrs/ADR-002-supabase-sin-orm.md).

## Seguridad

Dos barreras, no una:

1. **Autorización en servidor.** La identidad se valida en cada caso de uso
   privado y se deriva de la sesión, nunca de un identificador enviado por el
   cliente.
2. **Row Level Security en PostgreSQL.** Cada tabla expuesta lleva políticas
   explícitas por propietario, con denegación por defecto.

La segunda existe porque la primera puede fallar. Se prueba que un usuario no
puede leer, escribir ni borrar datos de otro, con tests contra la base de datos.

*Pendiente:* detalle de políticas por tabla, a medida que las fases 2 a 5 las creen.

## Validación

Se valida en cada borde: variables de entorno, formularios, Route Handlers,
archivos importados y cualquier campo JSON estructurado. La entrada de un archivo
subido se trata siempre como texto no confiable.

## Testing

| Nivel | Qué cubre |
|---|---|
| Unitario | Dominio, transformaciones de estado, orden de cola, parser, cálculos. Sin base de datos ni navegador. |
| Aplicación | Casos de uso con repositorios en memoria: autorización, idempotencia, conflictos de versión. |
| Base de datos | Esquema, restricciones, aislamiento entre usuarios, funciones transaccionales. |
| Componentes | Formularios, revelado de tarjeta, atajos, estados de carga y error. |
| Extremo a extremo | Flujos completos en escritorio y móvil emulado. |

Todo lo que depende del tiempo se prueba con reloj congelado.

## Documentos relacionados

- [`DATA_MODEL.md`](DATA_MODEL.md) — entidades, relaciones y convenciones del esquema.
- [`FSRS.md`](FSRS.md) — integración de la repetición espaciada.
- [`adrs/`](adrs/) — decisiones estructurales con sus alternativas descartadas.
