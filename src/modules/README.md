# Módulos de negocio

Cada carpeta de este directorio es un área de negocio, no un tipo de archivo.
La organización es *feature-first*: todo lo que hace falta para entender
«importación» vive en `importing/`, no repartido entre `components/`, `hooks/`,
`services/` y `types/`.

## Módulos previstos

| Módulo | Responsabilidad | Llega en |
|---|---|---|
| `identity` | Autenticación, perfil y sesión | Fase 2 — **existe** (`domain/`, `application/`, `infrastructure/`) |
| `courses` | Idiomas, cursos y configuración educativa | Fase 2 — **existe** (`domain/`, `application/`, `infrastructure/`) |
| `library` | Mazos, conceptos, ítems de práctica y etiquetas | Fase 3 — **existe** (`domain/` LEX-3.1, `application/` + `infrastructure/` LEX-3.4; `presentation/` en LEX-3.5+) |
| `importing` | Previsualización, validación e importación de archivos | Fase 4 — **existe** (`domain/` + `application/` + `infrastructure/` LEX-4.2: parser delimitado tras puerto; `presentation/` en LEX-4.4) |
| `study` | Cola diaria, sesiones, repetición espaciada e historial | Fases 5 y 6 |
| `analytics` | Consultas y estadísticas | Fase 7 |
| `settings` | Preferencias, exportación y eliminación | Fase 8 |
| `demo` | Experiencia pública sin registro | Fase 10 |

**Las carpetas se crean cuando el módulo se implementa, no antes.** Un árbol de
directorios vacíos no es arquitectura: es ruido que hay que mantener y que
además contradice el criterio de `ARCHITECTURE.md` de no repetir las cuatro capas
en módulos triviales.

## Capas dentro de un módulo

```text
modules/<modulo>/
  domain/          Entidades, invariantes, lógica pura. Sin entrada ni salida.
  application/     Casos de uso, comandos, consultas y puertos.
  infrastructure/  Repositorios, adaptadores, clientes externos.
  presentation/    Componentes, formularios, view models.
```

Un módulo no está obligado a tener las cuatro. Sí está obligado a respetar la
dirección de las dependencias.

## La regla, que no es solo una recomendación

```text
presentation ──► application ──► domain
                      ▲             ▲
infrastructure ───────┘─────────────┘
```

- `domain` no importa React, Next.js, Supabase, `ts-fsrs` ni ninguna otra capa.
- `application` depende de `domain` y de puertos, nunca de implementaciones.
- `presentation` llama a casos de uso, nunca a repositorios.

**Está comprobada por ESLint.** Ver el bloque de `no-restricted-imports` en
`eslint.config.mjs`: una importación prohibida falla el lint, y con él
`pnpm check` y la CI. No depende de que alguien se acuerde en la revisión.

El razonamiento completo está en
[ADR-001](../../docs/adrs/ADR-001-monolito-modular-clean-architecture.md).
