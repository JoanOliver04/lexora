import { describe, expect, it } from "vitest";

import { newPasswordSchema, parseCredentials, parseEmail } from "./credentials";

describe("parseCredentials", () => {
  it("acepta un correo y una contraseña válidos, y normaliza el correo", () => {
    const parsed = parseCredentials({ email: "  Persona@Example.COM ", password: "abcd1234" });

    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual({ email: "persona@example.com", password: "abcd1234" });
  });

  it("rechaza un correo sin arroba", () => {
    const parsed = parseCredentials({ email: "no-es-correo", password: "abcd1234" });

    expect(parsed.ok).toBe(false);
    expect(parsed.issue).toBe("email-invalid");
  });

  it("rechaza una contraseña demasiado corta con una clave estable", () => {
    const parsed = parseCredentials({ email: "persona@example.com", password: "corta" });

    expect(parsed.ok).toBe(false);
    expect(parsed.issue).toBe("password-too-short");
  });

  it("rechaza una contraseña por encima del límite de bcrypt", () => {
    const parsed = parseCredentials({
      email: "persona@example.com",
      password: "a".repeat(73),
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.issue).toBe("password-too-long");
  });

  it("no lanza con entradas que no son cadenas", () => {
    const parsed = parseCredentials({ email: 42, password: null });

    expect(parsed.ok).toBe(false);
    expect(parsed.issue).toBeDefined();
  });
});

describe("nuevas contraseñas", () => {
  it("pide doce caracteres al registrarse y al cambiar de contraseña", () => {
    const password = "ochoabcd";
    expect(
      parseCredentials({ email: "persona@example.com", password }, "registration"),
    ).toMatchObject({
      ok: false,
      issue: "password-too-short",
    });
    expect(newPasswordSchema.safeParse(password).success).toBe(false);
    expect(newPasswordSchema.safeParse("🔑".repeat(6)).success).toBe(false);
    expect(newPasswordSchema.safeParse("una frase larga").success).toBe(true);
  });

  it("mide el límite de bcrypt en bytes UTF-8 sin prohibir Unicode", () => {
    expect(newPasswordSchema.safeParse("é".repeat(36)).success).toBe(true);
    const result = newPasswordSchema.safeParse("é".repeat(37));
    expect(result.error?.issues[0]?.message).toBe("password-too-long");
  });
});

describe("parseEmail", () => {
  it("acepta y normaliza un correo válido", () => {
    expect(parseEmail({ email: " A@B.com " })).toEqual({ ok: true, data: "a@b.com" });
  });

  it("rechaza un correo vacío", () => {
    const parsed = parseEmail({ email: "   " });
    expect(parsed.ok).toBe(false);
    expect(parsed.issue).toBeDefined();
  });
});
