# ADR-007 — Gráficos estadísticos con HTML accesible

**Estado:** Aceptado. **Fecha:** 2026-11-11. **Decide:** implementación autónoma
autorizada por Joan, con alcance local y sin publicación.

## Contexto

Las primeras estadísticas muestran distribuciones, actividad diaria y siete
días de previsión. La interacción consiste en seleccionar periodo y mazo;
no requiere zoom, arrastre, leyendas interactivas ni gráficos temporales densos.

## Decisión

Usar tablas, listas de definición y medidores HTML nativos, renderizados en el
servidor. Mantener nombres accesibles, fechas, cifras visibles y explicaciones
de denominadores. Aplicar el color de acento del sistema visual a los medidores
en Chromium y Firefox. Los filtros son formularios GET y los detalles usan HTML
nativo. No añadir Recharts para estas visualizaciones.

Esta es una adaptación deliberada de la biblioteca inicialmente prevista:
reduce JavaScript e hidratación sin perder la información disponible. No
cambia el modelo de métricas ni la forma de calcular los agregados.

## Consecuencias

Las cifras se pueden consultar sin depender de color, hover o un canvas. La
presentación admite temas, reflujo y texto ampliado. Se renuncia a tooltips y
animaciones que no aportan información necesaria en estas pantallas.

La representación nativa puede variar entre motores. La instalación de PWA y
las pruebas con lector real siguen siendo gates independientes. Si aparecen
series extensas o interacción analítica necesaria, reabrir esta decisión y
evaluar una biblioteca cargada solo en esa ruta, conservando la alternativa
textual. No instalarla de forma anticipada.
