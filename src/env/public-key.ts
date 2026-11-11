/** Configuration guard only. JWT authentication is always verified by Auth. */
export function isPublicSupabaseKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload: unknown = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return (
      typeof payload === "object" &&
      payload !== null &&
      "role" in payload &&
      payload.role === "anon"
    );
  } catch {
    return false;
  }
}
