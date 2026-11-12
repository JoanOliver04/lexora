# Auditoría de accesibilidad de la V1 personal

Fecha: 2026-11-12. Objetivo: flujos críticos A/AA; no es una certificación de
conformidad integral. La aceptación física del propietario está separada en
[instalación](LEX-9-installation.md).

## Alcance y método

`@axe-core/playwright`4.14.0, dependencia solo de desarrollo, ejecuta reglas
WCAG2 A/AA,2.1 A/AA y2.2 AA sin excluir elementos ni deshabilitar reglas.
Se recorre la página completa y se conserva JSON con infracciones e incompletos.
Se espera el final real de las transiciones finitas al cambiar de tema.

Los27 estados incluyen portada, identidad y errores, onboarding, Hoy,
biblioteca/listas/detalles, importación hasta confirmar, ajustes/datos,
preparación de estudio, frente sin respuesta, revelado con Enter, resumen,
historial, estadísticas y confirmación de borrado sin ejecutarlo.
La pasada ES/EN×Chromium escritorio/móvil×claro/oscuro produjo216 análisis:
cero infracciones y cero incompletos. Registro cerrado4 y Preview4 también PASS;
las pantallas de Preview produjeron8 análisis sin infracciones ni incompletos.

El helper también recorre los controles con Tab y comprueba un ciclo completo,
alcanzabilidad y contorno de al menos2px. Respeta los radios nativos, los controles
ocultos en details cerrados y los pasos internos de los campos de fecha. La pasada
dirigida ES/escritorio con este recorrido completo y la mejora de fechas PASS.
Falta repetir la matriz completa con esta comprobación final antes de publicar.

## Hallazgos corregidos

| Criterio | Hallazgo reproducido | Corrección |
|---|---|---|
| 1.4.3 Contraste | Texto de12px en claro daba4,18:1 | Token de apoyo54%; mínimo4,56:1 sobre los tres fondos; gate exige4,5 incluso para texto pequeño |
| 1.3.1 Relaciones | dl de estadísticas contenía párrafos y agrupaciones anidadas inválidas | Descripciones dd y distribución de valoraciones en lista nativa, manteniendo datos y disposición |
| 4.1.2 Semántica | aria-label en un párrafo de Hoy no admitía el nombre previsto | Prefijo de texto sr-only conservando el valor del tiempo |
| Foco visible | El botón interno del calendario perdía el contorno exterior del campo | Regla focus-within para fechas además de focus-visible |

La búsqueda de variantes corrigió también la descripción condicional de repasos
disponibles de Hoy. El control estático cubre14 pares por tema, incluidos texto
principal/secundario/de apoyo sobre los tres fondos, enlaces y controles.

Los fallos del primer arnés de Tab eran de detección de detalles cerrados y
subcampos nativos de fecha; se corrigió el arnés, no se quitaron controles de la
interfaz. La prueba de estudio sigue verificando que la respuesta no aparece
antes de revelarla. Reflow320px y texto200% se verifican con la utilidad compartida;
no equivalen a zoom nativo ni a una prueba física nueva.

Referencia de integración: [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing).
Pendientes: gate general final, matriz completa actualizada, revisión, CI y despliegue.
