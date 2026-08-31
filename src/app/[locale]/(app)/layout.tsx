import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ensureProfileForCurrentUser, getCurrentUserId } from "@/composition/identity";

/**
 * Puerta del área autenticada.
 *
 * El proxy ya redirige a `login` con `next` cuando falta la sesión: eso es la
 * comodidad. **Esta** comprobación es la barrera de verdad —se ejecuta en el
 * servidor, en cada render— y por eso es una negación a secas: si se llega hasta
 * aquí sin sesión, algo ha fallado antes y no se confía en ningún `next` que
 * traiga el cliente. La navegación se reanuda desde `login`.
 *
 * Con sesión, se asegura el perfil (LEX-2.4): este es el punto de entrada que
 * ADR-005 dejó pendiente para cerrar la ventana «sesión sin fila de perfil».
 *
 * `force-dynamic` mantiene todo el subárbol fuera del renderizado estático: una
 * página privada no debe quedar cacheada.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect(`/${locale}/login`);
  }

  await ensureProfileForCurrentUser();

  return children;
}
