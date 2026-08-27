import type { ComponentProps } from "react";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={[
        "w-full rounded-(--radius-control) px-3 min-h-11",
        "border border-(--color-border-strong)",
        "bg-(--color-surface) text-(--color-ink)",
        "placeholder:text-(--color-ink-subtle)",
        // El borde de error acompana al color, nunca lo sustituye: el mensaje
        // de error asociado es lo que informa a quien no distingue el rojo.
        "aria-invalid:border-(--color-danger)",
        "disabled:opacity-50",
        className,
      ].join(" ")}
      {...props}
    />
  );
}
