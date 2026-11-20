/**
 * Día de estudio en zona IANA (LEX-5.12, MASTER_SPEC §14.6).
 *
 * `due_at` / `reviewed_at` se guardan en UTC. El día local (cola, cupos
 * de nuevos y de repasos) va del primer instante válido de una fecha al
 * primer instante de la siguiente, en la zona del perfil y con fin exclusivo.
 *
 * Lógica pura: sin reloj de sistema, sin `new Date()` vacío.
 */

import { isIanaTimeZone } from "@/shared/domain/time-zone";
export { isIanaTimeZone } from "@/shared/domain/time-zone";

export const DEFAULT_STUDY_TIMEZONE = "Europe/Madrid";
const DAY_MS = 86_400_000;

export interface StudyDayWindow {
  /** Inicio del día local, inclusive, en UTC. */
  start: Date;
  /** Inicio del día local siguiente, exclusivo, en UTC. */
  end: Date;
}

export function studyDayWindow(now: Date, timeZone: string): StudyDayWindow {
  if (!isIanaTimeZone(timeZone)) {
    throw new Error(`zona IANA no reconocida: ${timeZone}`);
  }
  const formatter = calendarFormatter(timeZone);
  const midnight = Math.floor(wallTimeAt(now.getTime(), formatter) / DAY_MS) * DAY_MS;
  return dayWindow(midnight, formatter);
}

/** Strict civil-date input, including impossible dates and DST boundaries. */
export function studyDateWindow(value: string, timeZone: string): StudyDayWindow | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isIanaTimeZone(timeZone)) return null;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  if (year < 1900 || year > 9998) return null;
  const midnight = Date.UTC(year, month - 1, day);
  if (new Date(midnight).toISOString().slice(0, 10) !== value) return null;
  const window = dayWindow(midnight, calendarFormatter(timeZone));
  return window.start.getTime() < window.end.getTime() ? window : null;
}

function dayWindow(midnight: number, formatter: Intl.DateTimeFormat): StudyDayWindow {
  return {
    start: new Date(firstInstant(midnight, formatter)),
    end: new Date(firstInstant(midnight + DAY_MS, formatter)),
  };
}

function firstInstant(midnight: number, formatter: Intl.DateTimeFormat): number {
  // Sample both sides of the boundary so an overlap can offer two midnights.
  const offsets = new Set(
    [midnight - DAY_MS, midnight + DAY_MS].map((sample) => wallTimeAt(sample, formatter) - sample),
  );
  const candidates = [...offsets].map((offset) => midnight - offset);
  const exact = candidates.filter((instant) => wallTimeAt(instant, formatter) === midnight);
  if (exact.length > 0) return Math.min(...exact);

  // A forward transition can skip midnight or the whole date. Locate the
  // transition between the earlier and later projections of midnight.
  let before = Math.min(...candidates);
  let after = Math.max(...candidates);
  while (after - before > 1) {
    const middle = before + Math.floor((after - before) / 2);
    if (wallTimeAt(middle, formatter) < midnight) before = middle;
    else after = middle;
  }
  return after;
}

function calendarFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

/** Local calendar fields encoded as UTC so calendar arithmetic is offset-free. */
function wallTimeAt(instant: number, formatter: Intl.DateTimeFormat): number {
  const raw = formatter.formatToParts(instant);

  function number(type: Intl.DateTimeFormatPartTypes): number {
    const part = raw.find((entry) => entry.type === type);
    if (!part) throw new Error(`Intl no devolvió ${type}`);
    return Number(part.value);
  }

  return Date.UTC(
    number("year"),
    number("month") - 1,
    number("day"),
    number("hour"),
    number("minute"),
    number("second"),
  );
}
