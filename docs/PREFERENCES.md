# Preferencias de cuenta y curso

La pantalla `/{locale}/app/settings` guarda idioma ES/EN, tema claro/oscuro/sistema
y zona IANA en el perfil. Los límites y la visibilidad inicial de intervalos se
guardan en el curso. La URL conserva el idioma de la navegación; guardar un idioma
distinto redirige a la pantalla de ajustes en ese idioma. Al entrar o refrescar
el área privada, el tema persistido prevalece sobre el almacenamiento del navegador.

## Escritura e identidad

`save_preferences` y `set_active_course` son SECURITY INVOKER, con `search_path`
vacío y EXECUTE solo para authenticated. Derivan el usuario de `auth.uid()`, pasan
por RLS y solo aceptan cursos propios activos. No usan service role ni exponen
retención, pesos o versiones internas de FSRS.

Guardar preferencias bloquea primero el perfil y después los ajustes del curso.
Compara ambas versiones `updated_at`, conservando sus microsegundos originales.
Un conflicto aborta la transacción completa y devuelve `PT409`, que se traduce
en un aviso y una recarga explícita. No se usan códigos de fallo transitorio para
un conflicto de edición: [Supabase documenta los reintentos internos de `40001`
en PostgREST 14](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
La prueba concurrente verifica un solo ganador y ausencia de escrituras parciales.

El selector de curso usa otra operación y formulario: cambia la referencia del
perfil, sin copiar límites del curso anterior. Su versión de perfil también
impide sobrescribir un cambio de otra pestaña. El catálogo del selector está
acotado a 200 cursos; superar ese límite devuelve un error recuperable.

## Cupos y tiempo

- Nuevas: entero 0–100; cero pausa la introducción de tarjetas.
- Review: vacío significa sin límite; entero 0–2.000, incluido cero.
- Learning/Relearning vencidos siguen disponibles al alcanzar los límites.
- El consumo se cuenta **por curso**, entre medianoches en la zona del perfil.
  No depende del mazo seleccionado ni excluye eventos de contenido archivado.
- Cambiar zona recalcula esa ventana; no cambia instantes UTC ni reescribe logs.
- Bajar un límite no deshace eventos confirmados. Hoy informa del contenido que
  queda fuera del cupo y el estudio vuelve a leer las preferencias del servidor.
- El preview guardado determina la visibilidad inicial de intervalos. El control
  dentro de una sesión permite alternarla sin modificar la preferencia guardada.

Las consultas privadas no se cachean públicamente. La sincronización entre
dispositivos ocurre al navegar/recargar y al leer de nuevo el servidor; esta V1
no necesita una suscripción Realtime para preferencias.
