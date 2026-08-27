import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv } from "@/env/client";

import type { Database } from "./database.types";

/**
 * Cliente para Server Components, Server Actions y Route Handlers.
 *
 * Lee la sesión de las cookies de la petición en curso, así que **se crea uno por
 * petición**. Reutilizar una instancia entre peticiones serviría a un usuario la
 * sesión de otro: es el fallo de aislamiento más grave que se puede cometer aquí,
 * y no daría ningún error visible.
 *
 * Usa la misma clave publishable que el navegador, no una privilegiada. La
 * identidad la aporta la cookie de sesión, y los permisos los decide RLS. Un
 * cliente con clave privilegiada saltaría RLS por completo, y entonces cualquier
 * descuido en una consulta expondría datos de otros usuarios.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Un Server Component no puede escribir cabeceras. No es un error:
            // quien persiste las cookies renovadas es el proxy, que se ejecuta
            // antes y sí puede. Silenciarlo aquí es lo correcto; lanzar
            // rompería cualquier lectura desde un Server Component.
          }
        },
      },
    },
  );
}
