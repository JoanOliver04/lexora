import { describe, expect, it, vi } from "vitest";

import {
  type AuthGateway,
  InvalidCredentialsError,
  MissingRecoverySessionError,
  WeakPasswordError,
} from "./auth-gateway";
import { registerUser, requestPasswordReset, signInUser, updatePassword } from "./auth-flows";

const validEmail = "persona@example.com";
const validPassword = "abcd1234";

function gateway(overrides: Partial<AuthGateway> = {}): AuthGateway {
  return {
    register: vi.fn().mockResolvedValue("confirmation-required"),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    exchangeCode: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("registerUser", () => {
  it("valida antes de llamar al proveedor", async () => {
    const auth = gateway();
    const result = await registerUser(auth, { email: "x", password: validPassword }, "/next");

    expect(result).toEqual({ ok: false, error: "email-invalid" });
    expect(auth.register).not.toHaveBeenCalled();
  });

  it("devuelve el resultado del alta cuando las credenciales son válidas", async () => {
    const auth = gateway({ register: vi.fn().mockResolvedValue("signed-in") });
    const result = await registerUser(
      auth,
      { email: validEmail, password: validPassword },
      "/next",
    );

    expect(result).toEqual({ ok: true, result: "signed-in" });
  });

  it("un correo ya registrado no se distingue de uno nuevo", async () => {
    // El adaptador real traduce «user already exists» a este mismo resultado.
    const nueva = gateway({ register: vi.fn().mockResolvedValue("confirmation-required") });
    const repetida = gateway({ register: vi.fn().mockResolvedValue("confirmation-required") });

    const a = await registerUser(nueva, { email: validEmail, password: validPassword }, "/n");
    const b = await registerUser(repetida, { email: validEmail, password: validPassword }, "/n");

    expect(a).toEqual(b);
  });

  it("traduce una contraseña débil del proveedor", async () => {
    const auth = gateway({ register: vi.fn().mockRejectedValue(new WeakPasswordError()) });
    const result = await registerUser(auth, { email: validEmail, password: validPassword }, "/n");

    expect(result).toEqual({ ok: false, error: "weak-password" });
  });

  it("un fallo de infraestructura se devuelve, no se lanza", async () => {
    const auth = gateway({ register: vi.fn().mockRejectedValue(new Error("boom")) });
    const result = await registerUser(auth, { email: validEmail, password: validPassword }, "/n");

    expect(result).toEqual({ ok: false, error: "auth-unavailable" });
  });
});

describe("signInUser", () => {
  it("cualquier error de credenciales es el mismo: invalid-credentials", async () => {
    const badFormat = await signInUser(gateway(), { email: "x", password: "y" });
    const wrongPassword = await signInUser(
      gateway({ signIn: vi.fn().mockRejectedValue(new InvalidCredentialsError()) }),
      { email: validEmail, password: validPassword },
    );

    expect(badFormat).toEqual({ ok: false, error: "invalid-credentials" });
    expect(wrongPassword).toEqual({ ok: false, error: "invalid-credentials" });
  });

  it("resuelve ok cuando el proveedor acepta", async () => {
    expect(await signInUser(gateway(), { email: validEmail, password: validPassword })).toEqual({
      ok: true,
    });
  });
});

describe("requestPasswordReset", () => {
  it("resuelve ok tanto si el correo existe como si no", async () => {
    // El puerto resuelve igual en ambos casos; el caso de uso no puede saberlo.
    const auth = gateway();
    const result = await requestPasswordReset(auth, { email: validEmail }, "/reset");

    expect(result).toEqual({ ok: true });
    expect(auth.requestPasswordReset).toHaveBeenCalledWith(validEmail, "/reset");
  });

  it("rechaza un correo mal formado sin llamar al proveedor", async () => {
    const auth = gateway();
    const result = await requestPasswordReset(auth, { email: "no-correo" }, "/reset");

    expect(result).toEqual({ ok: false, error: "email-invalid" });
    expect(auth.requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe("updatePassword", () => {
  it("valida la longitud antes de llamar al proveedor", async () => {
    const auth = gateway();
    const result = await updatePassword(auth, { password: "corta" });

    expect(result).toEqual({ ok: false, error: "password-too-short" });
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it("traduce la falta de sesión de recuperación", async () => {
    const auth = gateway({
      updatePassword: vi.fn().mockRejectedValue(new MissingRecoverySessionError()),
    });
    const result = await updatePassword(auth, { password: validPassword });

    expect(result).toEqual({ ok: false, error: "missing-recovery-session" });
  });
});
