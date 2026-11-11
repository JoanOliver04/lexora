/** Production is closed unless its operator explicitly enables registration. */
export function registrationAllowed(environment: string, override?: "true" | "false"): boolean {
  return override === "true" || (override !== "false" && environment !== "production");
}
