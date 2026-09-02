"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Pantalla de éxito de un formulario que sustituye al formulario entero
 * (alta enviada, enlace de recuperación enviado, contraseña cambiada).
 *
 * `role="status"` (`aria-live="polite"`) hace que un lector de pantalla lea el
 * contenido al aparecer. Como el `<form>` —y con él el botón donde estaba el
 * foco— desaparece del DOM, el contenedor toma el foco al montarse
 * (`tabIndex={-1}`, fuera del orden de tabulación) para que quien navega con
 * teclado no acabe al principio del documento. `outline-none`: el contenedor no
 * es un control, solo un destino de foco programático; un anillo alrededor de
 * todo el panel sería ruido.
 */
export function FormStatus({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div ref={ref} role="status" tabIndex={-1} className="flex flex-col gap-3 outline-none">
      {children}
    </div>
  );
}
