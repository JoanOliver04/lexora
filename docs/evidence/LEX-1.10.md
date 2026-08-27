# LEX-1.10 — pgTAP y arnés de pruebas de base de datos

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-10-pgtap`
**Estado resultante:** `HECHO`

---

## 1. Por qué esta tarea importa más de lo que parece

En LEX-1.8 quedó escrito que ningún cliente usa clave privilegiada, que la
identidad la aporta la cookie de sesión y que los permisos los decide Row Level
Security. La consecuencia también quedó escrita: **una tabla sin políticas queda
abierta a Internet.**

Afirmar eso obliga a poder demostrarlo. Sin pgTAP, «RLS protege los datos» es una
frase en un documento de arquitectura. Esta tarea la convierte en algo que un
comando responde con sí o no.

## 2. El arnés

`supabase/tests/database/`, ejecutado con `pnpm db:test`. Los ficheros corren en
orden alfabético.

| Fichero | Qué hace |
|---|---|
| `000-setup.sql` | Habilita `pgtap` y ejecuta una prueba trivial. |
| `010-rls-enabled.sql` | Invariante: toda tabla de `public` tiene RLS habilitado. |

La prueba trivial de `000-setup.sql` es deliberada: si falla, el problema está en
el arnés y no en el esquema, y conviene saberlo antes de leer el resto de la
salida buscando una causa que no está ahí.

## 3. El invariante de RLS

```sql
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  $$,
  'Toda tabla de public tiene RLS habilitado'
);
```

**Hoy no hay ninguna tabla y la prueba pasa sin comprobar nada. Ese es
exactamente el momento de escribirla.** A partir de la primera migración de la
fase 2, olvidar el `enable row level security` deja de ser un descuido silencioso
y pasa a romper la suite, con el nombre de la tabla en la salida.

Escribirla después, cuando ya existan ocho tablas, significaría escribirla
mirando lo que hay en vez de lo que debería haber.

Comprueba que RLS está **habilitado**, no que las políticas sean correctas. Lo
segundo se prueba tabla por tabla, con un caso de dueño y otro de no-dueño, según
el gate de PostgreSQL del roadmap. Son dos preguntas distintas y esta responde la
barata.

## 4. La prueba, probada

Un test que solo se ha visto pasar no está probado. Se comprobaron los tres
estados:

### Tabla sin RLS → falla, y dice cuál

```text
# Failed test 1: "Toda tabla de public tiene RLS habilitado"
#     Unexpected records:
#         (sonda_sin_rls)
Result: FAIL
```

Nombrar la tabla culpable importa: un fallo que solo dice «alguna tabla no cumple»
obliga a buscarla a mano entre las migraciones.

### La misma tabla, con RLS → pasa

```text
All tests successful.
Result: PASS
```

Este segundo paso es el que da valor al primero. Sin él, la prueba podría estar
detectando simplemente «existe una tabla», y habría pasado por buena.

### Sonda retirada → pasa

```text
All tests successful.
Result: PASS
```

## 5. Verificaciones ejecutadas

```text
pnpm db:test    Files=2, Tests=2, Result: PASS
                (y FAIL reproducible con una tabla sin RLS)
pnpm check      exit=0
```

`db:test` no se ha añadido a `pnpm check`: necesita la base de datos en marcha, y
`check` debe poder ejecutarse sin ella. La CI los encadenará en LEX-1.12, que es
donde tiene sentido exigir el entorno completo.

## 6. Fuera de alcance

- Políticas RLS concretas y sus pruebas de dueño/no-dueño → fase 2, con las primeras tablas.
- Utilidades para crear usuarios de prueba → fase 2, cuando exista `auth.users` poblada.
- Ejecución en CI → LEX-1.12.
