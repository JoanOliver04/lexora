"use client";

import { useEffect, type RefObject } from "react";

/**
 * Tras un envío fallido, lleva el foco al primer campo inválido del formulario.
 *
 * `trigger` debe ser el estado que devuelve `useActionState`: React crea un
 * objeto nuevo en cada envío, así que el efecto se vuelve a ejecutar aunque el
 * código de error no cambie (dos intentos con el mismo error también recolocan
 * el foco). Si no hay ningún `[aria-invalid="true"]` visible —un éxito, o el
 * estado inicial sin error— no se toca el foco.
 *
 * El foco va al campo, no a la región `role="alert"`: ahí es donde hay que
 * escribir, y el `alert` ya se anuncia solo al insertarse. El campo apunta a esa
 * región con `aria-describedby`, así que al recibir el foco el lector de
 * pantalla lee la etiqueta y, a continuación, el motivo. Un `<fieldset>` de un
 * grupo de radios inválido necesita `tabIndex={-1}` para poder recibir el foco.
 */
export function useFocusFirstInvalid(
  formRef: RefObject<HTMLFormElement | null>,
  trigger: unknown,
): void {
  useEffect(() => {
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    invalid?.focus();
  }, [formRef, trigger]);
}
