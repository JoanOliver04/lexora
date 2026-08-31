# Architecture Decision Records

Cada ADR registra **una** decisión estructural: por qué se tomó, qué se descartó y
qué consecuencias acepta el proyecto. Sirven para que la arquitectura pueda
explicarse y, si hace falta, revertirse con conocimiento de causa.

## Índice

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-001](ADR-001-monolito-modular-clean-architecture.md) | Monolito modular con Clean Architecture pragmática | Aceptado |
| [ADR-002](ADR-002-supabase-sin-orm.md) | Supabase Data API con repositorios propios, sin ORM | Aceptado |
| [ADR-003](ADR-003-fsrs-programa-practice-item.md) | FSRS programa `PracticeItem`, no `Concept` | Aceptado |
| [ADR-004](ADR-004-pwa-online-first.md) | PWA online-first, sin estudio offline en V1 | Aceptado |
| [ADR-005](ADR-005-creacion-de-perfil.md) | La creación del perfil es un caso de uso, no un trigger | Aceptado |

## Reglas

- Un ADR no puede contradecir la especificación del producto sin una actualización coordinada y aprobada.
- Un ADR no se edita para cambiar de opinión: se crea uno nuevo que lo sustituye, y el antiguo pasa a `Sustituido por ADR-nnn`.
- Los números no se reutilizan.
- Estados posibles: `Propuesto`, `Aceptado`, `Sustituido por ADR-nnn`, `Retirado`.

## Formato

```markdown
# ADR-nnn — Título

**Estado:** · **Fecha:** · **Decide:**

## Contexto
## Decisión
## Alternativas consideradas
## Consecuencias
## Cómo se verifica
## Cuándo reabrir esta decisión
```
