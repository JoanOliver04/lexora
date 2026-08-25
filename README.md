# Lexora

**Plataforma adaptativa de aprendizaje de inglés A1–B2.**

Lexora ayuda a convertir vocabulario pasivo en vocabulario activo mediante
recuperación activa y repetición espaciada con [FSRS](https://github.com/open-spaced-repetition/ts-fsrs).
Su idea central es que **reconocer una palabra no es lo mismo que poder producirla**:
cada concepto se descompone en competencias distintas, y cada competencia tiene su
propio estado de memoria.

> ⚠️ **Estado: en desarrollo temprano.** Fase 0 de 10. Todavía no hay aplicación
> ejecutable ni demo pública. Este repositorio se irá construyendo por hitos
> pequeños y verificables.

## Modelo conceptual

| Término | Qué es |
|---|---|
| `Concept` | La unidad de conocimiento: una palabra, una *collocation*, una regla, una función comunicativa. |
| `PracticeItem` | Una competencia concreta sobre ese concepto: reconocerlo, recuperarlo, escucharlo, producirlo. |
| `LearningState` | El estado FSRS de un usuario para un `PracticeItem`. Cada competencia se programa por separado. |
| `ReviewLog` | Registro inmutable de cada repaso, con el estado antes y después. |

Saber reconocer *achievement* no marca automáticamente como dominada su producción.

## Stack previsto

- **Aplicación:** Next.js (App Router), React, TypeScript estricto, pnpm
- **Datos e identidad:** Supabase — PostgreSQL, Auth con sesión SSR, Row Level Security
- **Repetición espaciada:** `ts-fsrs`, encapsulado tras un puerto de dominio
- **Interfaz:** Tailwind CSS, shadcn/ui, next-intl (ES/EN), Zod
- **Testing:** Vitest, React Testing Library, Playwright, pgTAP
- **Infraestructura:** GitHub Actions, Vercel

Arquitectura: monolito modular con Clean Architecture pragmática y organización
feature-first. El dominio no conoce React, Next.js, Supabase ni `ts-fsrs`.

## Alcance de la V1

**Incluye:** cuenta y onboarding · mazos, conceptos e ítems · importación TXT/CSV
desde Anki · sesión diaria con FSRS y cuatro valoraciones · sincronización entre
dispositivos · historial y estadísticas · exportación y borrado de datos · PWA
instalable · interfaz en español e inglés.

**No incluye:** IA generativa o correctora, evaluación automática de pronunciación,
generación de audio, funcionamiento completo sin conexión, aplicaciones nativas,
compartir mazos ni funciones sociales. Llegarán, si llegan, después de cerrar la V1.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | Estado actual, verificaciones ejecutadas y siguiente acción. |
| [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) | Decisiones pendientes, con contexto y opciones. |
| [`docs/adrs/`](docs/adrs/) | Architecture Decision Records. |
| [`docs/evidence/`](docs/evidence/) | Informes de evidencia por tarea. |
| [`CLAUDE.md`](CLAUDE.md) | Protocolo de trabajo para agentes en este repositorio. |

La especificación maestra y el roadmap detallado se mantienen fuera del
repositorio de forma deliberada.

## Licencia

Todavía sin decidir. Hasta que exista un archivo `LICENSE`, se reservan todos los derechos.
