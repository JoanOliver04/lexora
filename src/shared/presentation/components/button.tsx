import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "danger";

const base = [
  "inline-flex items-center justify-center gap-2",
  "rounded-(--radius-control) px-4 text-sm font-medium",
  // 44px de alto minimo: es el objetivo tactil recomendado. Un boton de 32px
  // funciona con raton y falla con el pulgar, que es como se va a usar esto.
  "min-h-11",
  "transition-colors duration-(--duration-quick)",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

const variants: Record<Variant, string> = {
  primary: "bg-(--color-accent) text-(--color-on-accent) hover:bg-(--color-accent-hover)",
  secondary:
    "border border-(--color-border-strong) text-(--color-ink) hover:bg-(--color-surface-sunken)",
  danger: "bg-(--color-danger) text-(--color-on-danger)",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      // `type="button"` por defecto a proposito: el defecto de HTML es
      // `submit`, y un boton dentro de un formulario que solo abre un menu
      // acaba enviandolo.
      type={type}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
