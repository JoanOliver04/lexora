import { describe, expect, it } from "vitest";
import { registrationAllowed } from "./registration-policy";
describe("Registration policy", () => {
  it("closes production by default", () => expect(registrationAllowed("production")).toBe(false));
  it("allows synthetic local development and test accounts", () => {
    expect(registrationAllowed("development")).toBe(true);
    expect(registrationAllowed("test")).toBe(true);
  });
  it.each(["production", "development", "test"])(
    "honours an explicit closure in %s",
    (environment) => expect(registrationAllowed(environment, "false")).toBe(false),
  );
  it("requires explicit operator configuration to open production", () =>
    expect(registrationAllowed("production", "true")).toBe(true));
});
