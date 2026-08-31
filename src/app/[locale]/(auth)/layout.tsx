import type { ReactNode } from "react";

import { ThemeToggle } from "@/shared/presentation/theme/theme-toggle";

import { LocaleSwitcher } from "../locale-switcher";

/**
 * Marco de las rutas de autenticación. Mantiene a mano el cambio de idioma y de
 * tema —quien llega a registrarse puede querer la interfaz en el otro idioma— y
 * deja el contenido a cada pantalla.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="absolute top-4 right-4 flex items-start gap-4">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
