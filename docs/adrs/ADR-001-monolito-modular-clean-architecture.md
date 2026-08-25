# ADR-001 — Monolito modular con Clean Architecture pragmática

**Estado:** Aceptado
**Fecha:** 2026-08-26
**Decide:** propietario del proyecto

## Contexto

Lexora la desarrolla una sola persona y la V1 tiene un alcance deliberadamente
pequeño. Al mismo tiempo, su lógica no es trivial: programación de repasos con un
algoritmo externo, importación de archivos no confiables, reglas de cola diaria,
límites configurables y estado de memoria por usuario.

Eso deja dos riesgos opuestos, y ambos han hundido proyectos parecidos:

1. **Escribir la lógica dentro de la interfaz.** Es el camino por defecto en
   Next.js: componentes que consultan la base de datos, Server Actions que
   calculan intervalos, reglas de negocio repartidas entre rutas. Funciona hasta
   que hay que probar el comportamiento dependiente del tiempo, y entonces no hay
   nada que probar sin levantar un navegador y una base de datos.
2. **Sobre-estructurar por anticipado.** Interfaces para cada operación,
   una carpeta por concepto abstracto, servicios que solo delegan. Mucho
   andamiaje, poco producto.

Además, el proyecto tiene una finalidad de portfolio: la arquitectura debe poder
explicarse en voz alta, con sus motivos, no solo funcionar.

## Decisión

**Un único despliegue —la aplicación Next.js— organizado internamente como
monolito modular, con separación de capas y organización *feature-first*.**

Cuatro capas, con las dependencias apuntando siempre hacia dentro:

| Capa | Contiene | Puede depender de |
|---|---|---|
| `domain` | Entidades, *value objects*, invariantes, errores de negocio. Lógica pura, sin I/O. | Nada |
| `application` | Casos de uso, comandos y consultas, puertos, autorización contextual. | `domain` |
| `infrastructure` | Clientes de base de datos, repositorios, adaptadores externos, parsers. | `domain`, `application` |
| `presentation` | Rutas, componentes, Server Actions, Route Handlers, formularios. | `application` |

Los módulos se organizan por área de negocio —identidad, cursos, biblioteca,
importación, estudio, analítica, ajustes— y no por tipo de archivo.

«Pragmática» significa que **no** se crea una interfaz, una carpeta o una clase
por simetría. Un módulo trivial puede no tener las cuatro capas. Lo que sí es
innegociable es la regla de dependencia: `domain` no importa React, Next.js, el
cliente de base de datos ni la librería de repetición espaciada.

## Alternativas consideradas

**Microservicios, o un segundo backend en Python.**
Descartada. No hay ningún componente que necesite escalar de forma independiente,
y el producto sí necesita transacciones sencillas entre entidades que viven
juntas. Separar servicios ahora significaría inventar autenticación entre
servicios, consistencia distribuida y despliegues coordinados para resolver
problemas que el proyecto no tiene. Si más adelante aparece una tarea que
justifique realmente otro runtime —procesamiento lingüístico pesado, por
ejemplo—, extraerla desde un monolito modular es un trabajo acotado.

**Next.js «idiomático» sin capas.**
Descartada. Es la opción más rápida las dos primeras semanas y la más cara
después. La transición de estado de un repaso debe poder probarse con relojes
congelados, sin navegador y sin base de datos; eso exige que viva en una función
pura, no en un componente.

**Clean Architecture ortodoxa.**
Descartada. Un puerto por operación y una implementación por puerto produce, en
un proyecto de este tamaño, más archivos de indirección que de comportamiento.
Se conserva la regla de dependencia, que es la parte que aporta valor, y se
descarta la ceremonia.

## Consecuencias

**A favor:**

- El núcleo —cola diaria, transiciones de memoria, validación de importación— se
  prueba con tests unitarios rápidos y deterministas.
- Cambiar de proveedor de base de datos o de librería de repetición espaciada
  afecta a adaptadores, no al producto.
- La estructura por módulos hace evidente dónde vive cada cosa.
- Un solo despliegue: una sesión, una base de datos, una pipeline.

**En contra, y aceptado:**

- Hay indirección. Añadir un campo a veces toca cuatro archivos en lugar de uno.
- Exige disciplina sostenida: la capa de presentación siempre tiene la tentación
  de llamar directamente a la base de datos.
- El límite entre «pragmático» y «relajado» es un juicio, no una regla mecánica.
  Los casos dudosos se resuelven en un ADR nuevo, no en silencio.

## Cómo se verifica

- Regla de *lint* que prohíbe importaciones desde `domain` hacia el exterior.
- Los tests de dominio y de casos de uso se ejecutan sin base de datos ni navegador.
- Revisión de cada Pull Request contra el gate de arquitectura del roadmap.

## Cuándo reabrir esta decisión

- Si aparece una carga de trabajo que necesite un runtime distinto o escalado independiente.
- Si la indirección demuestra estar frenando el desarrollo sin evitar ningún error real.
- Si el número de módulos crece hasta hacer inmanejable el despliegue único.
