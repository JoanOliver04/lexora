/**
 * Día de estudio en zona IANA (LEX-5.12, MASTER_SPEC §14.6).
 *
 * `due_at` / `reviewed_at` se guardan en UTC. El día local (cola, cupos
 * de nuevos y de repasos) es medianoche–medianoche en la zona del
 * perfil, fin exclusivo. La zona por defecto de V1 es `Europe/Madrid`.
 *
 * Lógica pura: sin reloj de sistema, sin `new Date()` vacío.
 */

export const DEFAULT_STUDY_TIMEZONE = "Europe/Madrid";

export interface StudyDayWindow {
  /** Inicio del día local, inclusive, en UTC. */
  start: Date;
  /** Inicio del día local siguiente, exclusivo, en UTC. */
  end: Date;
}

export function isIanaTimeZone(value: string): boolean {
  if (value.trim() === "" || value.trim() !== value) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function studyDayWindow(now: Date, timeZone: string): StudyDayWindow {
  if (!isIanaTimeZone(timeZone)) {
    throw new Error(`zona IANA no reconocida: ${timeZone}`);
  }
  const local = localCalendarDate(now, timeZone);
  const start = zonedWallTimeToUtc(local.year, local.month, local.day, 0, 0, 0, timeZone);
  const next = addCalendarDay(local);
  const end = zonedWallTimeToUtc(next.year, next.month, next.day, 0, 0, 0, timeZone);
  return { start, end };
}

function localCalendarDate(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = zonedParts(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function addCalendarDay(date: { year: number; month: number; day: number }): {
  year: number;
  month: number;
  day: number;
} {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

/**
 * Instant UTC of a wall-clock time in `timeZone`. Midnight exists on
 * every civil day in `Europe/Madrid`; the DST gap/overlap is at 02:00.
 */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = tzOffsetMs(new Date(utcGuess), timeZone);
  const instant1 = utcGuess - offset1;
  const offset2 = tzOffsetMs(new Date(instant1), timeZone);
  if (offset1 === offset2) return new Date(instant1);
  const instant2 = utcGuess - offset2;
  const offset3 = tzOffsetMs(new Date(instant2), timeZone);
  if (offset2 === offset3) return new Date(instant2);
  return new Date(Math.min(instant1, instant2));
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

function zonedParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  function number(type: Intl.DateTimeFormatPartTypes): number {
    const part = raw.find((entry) => entry.type === type);
    if (!part) throw new Error(`Intl no devolvió ${type} para ${timeZone}`);
    return Number(part.value);
  }

  return {
    year: number("year"),
    month: number("month"),
    day: number("day"),
    hour: number("hour"),
    minute: number("minute"),
    second: number("second"),
  };
}
