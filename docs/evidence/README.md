# Evidencia de tareas

Esta carpeta guarda los informes de evidencia que no caben en una fila de [`ROADMAP.md`](../no_visible_en_github/ROADMAP.md) *(documento local, no versionado)*.

## Cuándo crear un archivo aquí

La fila de una tarea en el roadmap guarda un **resumen breve** de evidencia. Se crea un archivo en esta carpeta cuando el informe necesita más detalle: salidas largas de comandos, tablas de resultados pgTAP, matrices de dispositivos, mediciones de rendimiento o auditorías.

## Convención de nombres

```text
docs/evidence/LEX-n.m.md
```

Un archivo por tarea. El ID coincide exactamente con el del roadmap y nunca se reutiliza.

## Contenido mínimo

```markdown
# LEX-n.m — Título de la tarea

**Fecha:**
**Rama / commit:**
**Estado resultante:**

## Comandos ejecutados y salida real
## Resultados de tests
## Comprobaciones manuales y quién las hizo
## Hallazgos y decisiones
## Limitaciones o deuda registrada
```

## Reglas

- Se registra la **salida real** de los comandos, no un resumen de lo que se esperaba.
- No se incluyen secretos, tokens, correos, ni contenido de los archivos privados de Anki de Joan.
- Las muestras de datos importados se anonimizan o se sustituyen por recuentos.
- Un informe de evidencia no sustituye a los tests: documenta que se ejecutaron y con qué resultado.
