import type { ReactNode } from "react";

/**
 * Región de error de un formulario.
 *
 * `role="alert"` (que implica `aria-live="assertive"`) hace que un lector de
 * pantalla lo lea en cuanto aparece, sin robar el foco. El foco lo mueve el
 * formulario al primer campo inválido —ahí es donde hay que escribir— y ese
 * campo apunta aquí con `aria-describedby`, así que al llegar se vuelve a oír
 * el motivo. Ver `useFocusOnError`.
 *
 * El `id` es estable por formulario para poder referenciarlo desde
 * `aria-describedby`.
 */
export function FormError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} role="alert" className="flex flex-col gap-1 text-sm text-(--color-danger)">
      {children}
    </div>
  );
}
