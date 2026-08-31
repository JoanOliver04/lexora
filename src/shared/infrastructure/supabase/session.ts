import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { clientEnv } from "@/env/client";

import type { Database } from "./database.types";

/**
 * Renueva la sesión y propaga las cookies resultantes.
 *
 * Existe porque un Server Component no puede escribir cabeceras: si el token
 * caducado se renovara ahí, el valor nuevo no llegaría nunca al navegador y el
 * usuario acabaría desconectado sin motivo aparente. El proxy sí puede, y se
 * ejecuta antes que todo lo demás.
 *
 * Las cookies se escriben en **dos** sitios, y ambos hacen falta:
 *
 *   · en `request`, para que los Server Components de esta misma petición vean
 *     ya el token renovado en lugar del caducado;
 *   · en `response`, para que el navegador lo guarde para las siguientes.
 *
 * Escribir solo en `response` deja la petición actual con el token viejo.
 * Escribir solo en `request` renueva la sesión y la pierde al terminar.
 *
 * Devuelve también el `userId` de la sesión ya verificada (o `null`). El proxy
 * lo necesita para decidir si una ruta protegida es alcanzable, y esa
 * comprobación de firma ya se hace aquí: devolverla evita un segundo
 * `getClaims()` por petición y deja una sola fuente de verdad sobre «quién es».
 */
export async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<{ response: NextResponse; userId: string | null }> {
  const supabase = createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // `getClaims()`, no `getSession()`.
  //
  // `getSession()` devuelve lo que haya en la cookie sin comprobar que sea
  // auténtico. Una cookie la escribe el navegador, y el navegador está bajo el
  // control de quien lo usa: confiar en ella para decidir permisos equivale a
  // preguntarle al visitante quién dice ser y creerle.
  //
  // `getClaims()` verifica la firma del token contra las claves públicas del
  // proyecto. Es la diferencia entre leer un carné y comprobarlo.
  const { data } = await supabase.auth.getClaims();

  return { response, userId: data?.claims.sub ?? null };
}
