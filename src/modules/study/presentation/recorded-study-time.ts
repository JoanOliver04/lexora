/** Round the accumulated time only for display. A missing measurement has no unit. */
export function formatRecordedStudyTime(locale: string, durationMs: number, measured: number) {
  if (measured === 0) return "—";
  const minutes = durationMs >= 60_000;
  const format = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: minutes ? "minute" : "second",
    unitDisplay: "short",
    maximumFractionDigits: minutes ? 1 : 0,
  });
  if (durationMs > 0 && durationMs < 1000) return `<${format.format(1)}`;
  return format.format(minutes ? durationMs / 60_000 : Math.floor(durationMs / 1000));
}
