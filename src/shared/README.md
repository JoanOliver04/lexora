# Código compartido

Lo que usan varios módulos y no pertenece a ninguno en concreto.

```text
shared/
  domain/          Tipos y primitivas de negocio transversales.
  application/     Puertos transversales: reloj, generador de identificadores.
  infrastructure/  Clientes de Supabase, observabilidad.
  presentation/    Componentes base, estilos, utilidades de interfaz.
```

## Criterio para poner algo aquí

Que lo necesiten **dos módulos distintos, ya**. No «que probablemente haga falta
más adelante».

Mover algo de un módulo a `shared/` cuando aparece el segundo uso cuesta cinco
minutos. Deshacer una abstracción compartida que resultó no encajar en ninguno de
los dos casos cuesta mucho más, y suele acabar en una función con cuatro
parámetros booleanos.

La regla de dependencia entre capas se aplica aquí igual que en los módulos:
`shared/domain` tampoco conoce React ni Next.js, y ESLint lo comprueba.
