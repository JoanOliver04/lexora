# Lexora — instrucciones para Claude Code

Lexora es una aplicación web de aprendizaje adaptativo de inglés A1–B2 basada en
recuperación activa y repetición espaciada con FSRS. Este archivo define **cómo**
debe trabajar un agente en este repositorio.

## Lectura obligatoria al empezar cada sesión

1. `docs/no_visible_en_github/MASTER_SPEC.md` — producto, alcance y arquitectura. Fuente de verdad.
2. `docs/no_visible_en_github/ROADMAP.md` — orden de ejecución, tareas `LEX-n.m`, estados y quality gates.
3. `docs/STATUS.md` — estado actual y siguiente acción exacta.
4. `docs/OPEN_QUESTIONS.md` — decisiones pendientes del propietario.
5. `docs/adrs/` — ADR relevantes para la tarea en curso.

Los dos primeros documentos son **privados y locales**: no están versionados, para
evitar que el diseño del producto se copie desde un repositorio público. Si no
existen en el clon actual, hay que pedirlos antes de tomar decisiones de producto.

Después de leer, ejecutar `git status` y revisar cambios ajenos antes de tocar nada.

## Reglas operativas

- Una única tarea `LEX-n.m` por vez. No avanzar dos tareas sin autorización expresa.
- Marcar la tarea `EN PROCESO` antes de tocar código; `HECHO` solo con evidencia real ejecutada.
- El protocolo completo está en `ROADMAP.md` §3; los quality gates, en §12.
- Actualizar `docs/STATUS.md` al terminar cada tarea, para que el proyecto pueda pausarse y retomarse sin reconstruir contexto.
- Registrar en `docs/OPEN_QUESTIONS.md` toda decisión que corresponda al propietario, con un ID estable `Q-nnn`.

## Límites de arquitectura

- Monolito modular, Clean Architecture pragmática, organización feature-first.
- El dominio no importa React, Next.js, Supabase, Vercel ni `ts-fsrs`.
- Las reglas de negocio no viven en componentes, Server Actions ni Route Handlers.
- `ts-fsrs` solo se usa detrás del puerto `SpacedRepetitionScheduler`.
- Toda tabla expuesta lleva RLS con políticas explícitas y tests de aislamiento.
- Todo cambio de esquema va en una migración SQL versionada.

## Prohibiciones

- Publicar, desplegar a producción o aplicar migraciones destructivas sin autorización explícita.
- Introducir `any`, `service_role` en cliente, o secretos en el repositorio.
- Desactivar tests, RLS o TypeScript estricto para conseguir un build verde.
- Usar datos privados del propietario como fixtures públicos o seeds.
- Copiar contenido de `docs/no_visible_en_github/` a archivos versionados. **El repositorio es público.**

## Prioridad

Expyria conserva la prioridad estratégica. Cuando el propietario comunique que
`DEV-5.13` está desbloqueado, pausar Lexora según `ROADMAP.md` §13.
