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
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-end gap-4 px-4 py-4 sm:px-6">
        <LocaleSwitcher />
        <ThemeToggle />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
