"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/shared/presentation/components";

/**
 * Botón de envío que se deshabilita y cambia de texto mientras el formulario
 * está en vuelo. `useFormStatus` lee el estado del `<form>` padre, así que este
 * componente tiene que estar **dentro** del formulario, no envolviéndolo.
 */
export function PendingButton({ idle, pending }: { idle: string; pending: string }) {
  const status = useFormStatus();

  return (
    <Button type="submit" disabled={status.pending} aria-busy={status.pending}>
      {status.pending ? pending : idle}
    </Button>
  );
}
