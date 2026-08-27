-- Invariante permanente: toda tabla de `public` tiene RLS habilitado.
--
-- Esta prueba existe por lo que se decidió en LEX-1.8: ningún cliente usa clave
-- privilegiada, la identidad la aporta la cookie de sesión y los permisos los
-- decide Row Level Security. La clave publishable viaja dentro del bundle que
-- descarga cualquier visitante.
--
-- La consecuencia es que **una tabla sin RLS queda abierta a Internet**. No
-- «menos protegida»: legible y escribible por cualquiera que sepa su nombre.
--
-- Hoy no hay ninguna tabla y la prueba pasa sin comprobar nada. Ese es el
-- momento correcto de escribirla: a partir de la primera migración de la fase 2,
-- olvidar el `enable row level security` deja de ser un descuido silencioso y
-- pasa a romper la suite.
--
-- Comprueba que RLS está *habilitado*, no que las políticas sean correctas. Lo
-- segundo se prueba tabla por tabla, con un caso de dueño y otro de no-dueño,
-- según el gate de PostgreSQL del roadmap.

begin;
select plan(1);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'          -- solo tablas ordinarias
      and not c.relrowsecurity
  $$,
  'Toda tabla de public tiene RLS habilitado'
);

select * from finish();
rollback;
