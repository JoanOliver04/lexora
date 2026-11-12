# Lexora

**Plataforma adaptativa de aprendizaje de inglés A1–B2.**

Lexora ayuda a convertir vocabulario pasivo en vocabulario activo mediante
recuperación activa y repetición espaciada con [FSRS](https://github.com/open-spaced-repetition/ts-fsrs).
Su idea central es que **reconocer una palabra no es lo mismo que poder producirla**:
cada concepto se descompone en competencias distintas, y cada competencia tiene su
propio estado de memoria.

> **V1.0 para uso personal.** Biblioteca e importación TXT/CSV, estudio FSRS con
> guardado confirmado, pausa/reanudación, historial, estadísticas y preferencias
> ES/EN. Exportación JSON/CSV verificada, borrado propio con reautenticación y PWA
> instalable con fallback neutral. El registro público permanece cerrado.
> [Aplicación](https://lexora-one-alpha.vercel.app/en) ·
> [aceptación y límites](docs/evidence/LEX-1.0-personal-acceptance.md) ·
> [estado de publicación](docs/STATUS.md).

## Modelo conceptual

| Término | Qué es |
|---|---|
| `Concept` | La unidad de conocimiento: una palabra, una *collocation*, una regla, una función comunicativa. |
| `PracticeItem` | Una competencia concreta sobre ese concepto: reconocerlo, recuperarlo, escucharlo, producirlo. |
| `LearningState` | El estado FSRS de un usuario para un `PracticeItem`. Cada competencia se programa por separado. |
| `ReviewLog` | Registro inmutable de cada repaso, con el estado antes y después. |

Saber reconocer *achievement* no marca automáticamente como dominada su producción.

## Stack

- **Aplicación:** Next.js (App Router), React, TypeScript estricto, pnpm
- **Datos e identidad:** Supabase — PostgreSQL, Auth con sesión SSR, Row Level Security
- **Repetición espaciada:** `ts-fsrs`, encapsulado tras un puerto de dominio
- **Interfaz:** Tailwind CSS, controles y tokens propios, next-intl (ES/EN), Zod
- **Testing:** Vitest, React Testing Library, Playwright, pgTAP
- **Accesibilidad automatizada:** axe-core en los flujos críticos, teclado, contraste y reflow
- **Infraestructura:** GitHub Actions, Vercel

Arquitectura: monolito modular con Clean Architecture pragmática y organización
feature-first. El dominio no conoce React, Next.js, Supabase ni `ts-fsrs`.

La revisión visual añade navegación persistente en escritorio y navegación
inferior en móvil, con temas propios y foco de teclado. La
[evidencia de diseño](docs/evidence/LEX-15-visual-direction.md) identifica las
comprobaciones y el estado de publicación; el motor de estudio se conserva.

## Alcance de la V1

**Incluye:** cuenta y onboarding · mazos, conceptos e ítems · importación TXT/CSV
desde Anki · sesión diaria con FSRS y cuatro valoraciones · sincronización entre
dispositivos · historial y estadísticas · exportación y borrado de datos · PWA
instalable · interfaz en español e inglés.

**No incluye:** IA generativa o correctora, evaluación automática de pronunciación,
generación de audio, funcionamiento completo sin conexión, aplicaciones nativas,
compartir mazos ni funciones sociales. Llegarán, si llegan, después de cerrar la V1.

La cuenta personal existente conserva su acceso; el registro y el onboarding
de cuentas sintéticas se prueban en local. Demo de captación, portfolio, SMTP
dedicado y Sentry quedan fuera de esta entrega por [ADR-008](docs/adrs/008-personal-use.md).

## Puesta en marcha local

Requisitos: **Node 24** (la versión exacta está en `.nvmrc`; con `nvm` basta
`nvm use`), **pnpm 11** (`corepack enable pnpm`) y **Docker** en marcha, que es lo
que necesita la base de datos local de Supabase.

```bash
pnpm install --frozen-lockfile   # dependencias exactas del lockfile
pnpm db:start                     # levanta Supabase local; imprime URL y clave publishable
cp .env.example .env.local        # y pega en .env.local los dos valores que imprimió db:start
pnpm db:reset                     # aplica migraciones y semillas desde una base limpia
```

A partir de ahí:

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo en `http://localhost:3000`. |
| `pnpm check` | Todas las puertas de calidad en cadena: formato, lint, tipos, contraste, tests y build. |
| `pnpm e2e` | Pruebas de extremo a extremo (Playwright) contra el build de producción. |
| `pnpm e2e:compat` | Matriz adicional Firefox/WebKit. |
| `pnpm db:test` | Pruebas de esquema y RLS (pgTAP). |
| `pnpm ops:backup:test` | Pruebas de las herramientas de backup cifrado. |
| `pnpm ops:recovery:verify` | Recuperación y Auth/RLS en bases locales desechables propias. |
| `pnpm db:stop` | Detiene la base de datos local. |

El detalle de ramas, commits, versiones fijadas, migraciones y entornos está en
[`docs/WORKFLOW.md`](docs/WORKFLOW.md).
`db:reset` se usa para inicializar una base local prescindible: elimina los datos
locales existentes. Los tests de navegador exigen backend loopback:54321 y usan
el puerto3100, separado del servidor de desarrollo. No apuntan a producción.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Capas, regla de dependencia, módulos y puertos. |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Entidades, relaciones y convenciones del esquema. |
| [`docs/FSRS.md`](docs/FSRS.md) | Integración de la repetición espaciada: puerto, transacción y tiempo. |
| [`docs/STATISTICS.md`](docs/STATISTICS.md) | Historial, métricas, denominadores y límites de la previsión. |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Entradas no confiables y enlaces a los contratos de protección. |
| [`docs/DEPLOYMENT_SECURITY.md`](docs/DEPLOYMENT_SECURITY.md) | CSP, cookies, Preview, CI y revisión de secretos. |
| [`docs/DATA_LIFECYCLE.md`](docs/DATA_LIFECYCLE.md) | Conservación, exportación y borrado propio con reautenticación. |
| [`docs/BACKUP_RECOVERY.md`](docs/BACKUP_RECOVERY.md) | Cifrado, copia externa y ensayo de recuperación con Auth/RLS. |
| [`docs/ANTI_ABUSE.md`](docs/ANTI_ABUSE.md) | Registro cerrado, límites de Auth y cuotas duraderas de operaciones costosas. |
| [`docs/evidence/LEX-1.0-personal-acceptance.md`](docs/evidence/LEX-1.0-personal-acceptance.md) | Trazabilidad de la entrega personal y límites conocidos. |
| [`docs/PWA.md`](docs/PWA.md) | Instalación explícita, actualizaciones y límite del fallback offline. |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | Términos del dominio y convenciones de nombres. |
| [`docs/CONTENT_POLICY.md`](docs/CONTENT_POLICY.md) | Qué contenido puede vivir en un repositorio público. |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | Ramas, commits, versiones fijadas, migraciones y entornos. |
| [`docs/STATUS.md`](docs/STATUS.md) | Estado actual, verificaciones ejecutadas y siguiente acción. |
| [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) | Decisiones pendientes, con contexto y opciones. |
| [`docs/adrs/`](docs/adrs/) | Architecture Decision Records. |
| [`docs/evidence/`](docs/evidence/) | Informes de evidencia por tarea. |
| [`CLAUDE.md`](CLAUDE.md) | Protocolo de trabajo para agentes en este repositorio. |

La especificación maestra y el roadmap detallado se mantienen fuera del
repositorio de forma deliberada.

## Licencia

Todavía sin decidir. Hasta que exista un archivo `LICENSE`, se reservan todos los
derechos. Ver [`docs/CONTENT_POLICY.md`](docs/CONTENT_POLICY.md).
