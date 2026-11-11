/** IANA names only; offset strings are unsuitable for civil-day boundaries. */
export function isIanaTimeZone(value: string): boolean {
  if (value.trim() === "" || value.trim() !== value || value.length > 100 || /^[+-]/.test(value))
    return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}
