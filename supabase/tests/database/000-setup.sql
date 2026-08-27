-- Preparación compartida de las pruebas de base de datos.
--
-- Los ficheros se ejecutan en orden alfabético, de ahí el `000`. Aquí van las
-- extensiones y dependencias que necesita el resto, para no repetirlas en cada
-- fichero.

create extension if not exists pgtap with schema extensions;

begin;
select plan(1);

-- Una prueba trivial a propósito: si esta falla, el problema no está en el
-- esquema sino en el arnés, y conviene saberlo antes de leer el resto de la
-- salida buscando una causa que no está ahí.
select ok(true, 'El arnés de pruebas de base de datos funciona');

select * from finish();
rollback;
