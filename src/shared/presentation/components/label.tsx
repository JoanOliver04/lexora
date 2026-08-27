import type { ComponentProps } from "react";

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return (
    <label
      className={`text-sm font-medium text-(--color-ink-muted) ${className}`}
      // Sin `htmlFor` una etiqueta es texto decorativo: no amplia el area
      // pulsable y un lector de pantalla no la asocia al campo.
      {...props}
    />
  );
}
