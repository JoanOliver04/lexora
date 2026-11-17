"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

import { Button } from "@/shared/presentation/components";

/**
 * Botón de envío que se deshabilita y cambia de texto mientras el formulario
 * está en vuelo. `useFormStatus` lee el estado del `<form>` padre, así que este
 * componente tiene que estar **dentro** del formulario, no envolviéndolo.
 */
export function PendingButton({
  idle,
  pending,
  variant = "primary",
  disabled = false,
}: {
  idle: string;
  pending: string;
  variant?: ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
}) {
  const status = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      disabled={status.pending || disabled}
      aria-busy={status.pending}
    >
      {status.pending ? pending : idle}
    </Button>
  );
}
