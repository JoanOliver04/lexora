import type { ReactNode } from "react";

/**
 * Marco visual común de las pantallas de autenticación: una tarjeta centrada,
 * con título y un pie opcional para los enlaces entre flujos.
 *
 * El `<h1>` es el título de la pantalla; cada página pasa el suyo ya traducido.
 */
export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {children}
      {footer ? <p className="text-sm text-(--color-ink-muted)">{footer}</p> : null}
    </main>
  );
}
