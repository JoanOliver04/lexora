import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/env/client";

import type { Database } from "./database.types";

/**
 * Cliente para código que se ejecuta en el navegador.
 *
 * Usa la clave *publishable*, que está pensada para ser pública: no concede
 * permisos por sí misma. Lo que este cliente pueda leer o escribir lo decide
 * Row Level Security dentro de PostgreSQL, evaluando la sesión del usuario.
 *
 * Por eso RLS no es una capa de seguridad más: es **la** capa. Cualquiera puede
 * extraer esta clave del bundle y hacer peticiones con ella. Una tabla sin
 * políticas queda abierta a Internet.
 *
 * Se crea una instancia por llamada. Crear un cliente es barato, y compartir uno
 * entre pestañas o entre usuarios sería un error de aislamiento.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
