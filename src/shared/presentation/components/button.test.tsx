// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

/**
 * Este test existe sobre todo para demostrar que el arnés de componentes
 * funciona: jsdom, Testing Library, los matchers de `jest-dom` y la limpieza
 * entre tests. Sin él, la instalación de LEX-1.9 quedaría sin probar.
 *
 * Comprueba además dos cosas que sí importan y que son fáciles de romper sin
 * darse cuenta.
 */
describe("Button", () => {
  it("es por defecto de tipo `button`, no `submit`", () => {
    // El valor por defecto de HTML es `submit`. Un botón dentro de un
    // formulario que solo abre un menú acabaría enviándolo.
    render(<Button>Abrir</Button>);
    expect(screen.getByRole("button", { name: "Abrir" })).toHaveAttribute("type", "button");
  });

  it("no ejecuta su acción cuando está deshabilitado", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("es accesible por su nombre para lectores de pantalla", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Empezar sesión</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Empezar sesión" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
