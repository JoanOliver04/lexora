// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useActionState, useRef } from "react";
import { describe, expect, it } from "vitest";

import { useFocusFirstInvalid } from "./use-focus-first-invalid";

/**
 * `useFocusFirstInvalid` lleva el foco al primer campo inválido tras cada envío
 * fallido. La prueba que discrimina es el **segundo** envío: un efecto atado
 * solo al montaje (`useEffect(…, [])`), o atado al código de error
 * (`useEffect(…, [state.error])`), no recolocaría el foco cuando el usuario ya
 * lo movió a otro sitio y reenvía con el mismo error. Atarlo al objeto de
 * estado —nuevo en cada envío— sí.
 */

type State = { error?: "first" | "second" };

function Harness() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, submit] = useActionState<State, State>((_prev, next) => next, {});
  useFocusFirstInvalid(formRef, state);

  return (
    <form ref={formRef}>
      <input aria-label="uno" aria-invalid={state.error === "first" || undefined} />
      <input aria-label="dos" aria-invalid={state.error === "second" || undefined} />
      <button type="button" onClick={() => submit({ error: "first" })}>
        fallar primero
      </button>
      <button type="button" onClick={() => submit({ error: "second" })}>
        fallar segundo
      </button>
      <button type="button" onClick={() => submit({})}>
        ok
      </button>
    </form>
  );
}

describe("useFocusFirstInvalid", () => {
  it("no toca el foco sin campos inválidos", () => {
    render(<Harness />);
    expect(document.body).toHaveFocus();
  });

  it("lleva el foco al primer campo inválido y lo recoloca en cada envío", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "fallar primero" }));
    expect(screen.getByLabelText("uno")).toHaveFocus();

    // El usuario mueve el foco a otro campo y reenvía con un error distinto.
    await user.click(screen.getByRole("button", { name: "fallar segundo" }));
    expect(screen.getByLabelText("dos")).toHaveFocus();

    // Reenvío con el MISMO error que la última vez: el foco vuelve al campo.
    await user.click(screen.getByLabelText("uno"));
    await user.click(screen.getByRole("button", { name: "fallar segundo" }));
    expect(screen.getByLabelText("dos")).toHaveFocus();
  });

  it("no recoloca el foco tras un envío correcto", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "fallar primero" }));
    expect(screen.getByLabelText("uno")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "ok" }));
    // Sin `[aria-invalid="true"]`, el efecto no mueve nada: el foco se queda
    // donde lo dejó el clic en el botón.
    expect(screen.getByRole("button", { name: "ok" })).toHaveFocus();
  });
});
