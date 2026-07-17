// Pure time / calendar helpers. No I/O, no DB. Everything in
// minutes-from-midnight (integers). Dates are "YYYY-MM-DD" strings compared
// lexicographically (valid for zero-padded ISO dates).

import type {
  Holiday,
  PatientAvailability,
  PatientException,
  Priority,
  Weekday,
  WorkingHour,
} from "./types.ts";

// getUTCDay(): 0 = Sunday .. 6 = Saturday
export const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** "HH:MM" or "HH:MM:SS" -> minutes from midnight. */
export function toMin(t: string): number {
  const parts = t.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/** minutes -> "HH:MM". */
export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" or "HH:MM:SS" -> "HH:MM:SS" (DB-friendly). */
export function toHHMMSS(t: string): string {
  const parts = t.split(":");
  const h = parts[0].padStart(2, "0");
  const m = (parts[1] ?? "00").padStart(2, "0");
  const s = (parts[2] ?? "00").padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function weekdayOf(date: string): Weekday {
  const [y, mo, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
}

/** Inclusive [from, to] list of date strings. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  while (cur <= end) {
    const dt = new Date(cur);
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${
        String(dt.getUTCDate()).padStart(2, "0")
      }`,
    );
    cur += 86400000;
  }
  return out;
}

/** Whole-day difference date2 - date1 (in days). */
export function dayDiff(date1: string, date2: string): number {
  const [ay, am, ad] = date1.split("-").map(Number);
  const [by, bm, bd] = date2.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000,
  );
}

/** date + "HH:MM" -> epoch ms (UTC wall-clock). */
export function dateTimeMs(date: string, min: number): number {
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d) + min * 60000;
}

export interface Window {
  start: number;
  end: number;
} // [start, end) in minutes

export interface AvailWindow extends Window {
  priority: Priority;
}

/** Capacity windows for a date: working_hours for the weekday minus holidays. */
export function capacityWindows(
  date: string,
  wh: WorkingHour[],
  holidays: Holiday[],
): Window[] {
  for (const h of holidays) {
    if (
      h.is_closed && h.affects_scheduler &&
      date >= h.start_date && date <= h.end_date
    ) {
      return [];
    }
  }
  const row = wh.find((r) => r.weekday === weekdayOf(date));
  if (!row || !row.is_open) return [];
  const out: Window[] = [];
  if (row.morning_start && row.morning_end) {
    out.push({ start: toMin(row.morning_start), end: toMin(row.morning_end) });
  }
  if (row.afternoon_start && row.afternoon_end) {
    out.push({
      start: toMin(row.afternoon_start),
      end: toMin(row.afternoon_end),
    });
  }
  return out;
}

/**
 * Effective availability windows for (patient, date) per §4.
 * - returns []            -> blackout, nothing allowed that day
 * - returns null          -> no rules, permissive (available in all working hours)
 * - returns [w, ...]      -> allowed inside these windows
 */
export function effectiveAvailability(
  patientId: string,
  date: string,
  avail: PatientAvailability[],
  exceptions: PatientException[],
): AvailWindow[] | null {
  const exc = exceptions.filter(
    (e) => e.patient_id === patientId && e.exception_date === date,
  );
  const blackout = exc.find(
    (e) => e.is_available === false && !e.start_time && !e.end_time,
  );
  if (blackout) return [];
  const overrides = exc.filter(
    (e) => e.is_available === true && e.start_time && e.end_time,
  );
  if (overrides.length > 0) {
    return overrides
      .map((override) => ({
        start: toMin(override.start_time!),
        end: toMin(override.end_time!),
        priority: "normal" as const,
      }))
      .sort((left, right) => left.start - right.start || left.end - right.end);
  }
  const w = weekdayOf(date);
  const base = avail.filter(
    (a) =>
      a.patient_id === patientId &&
      a.weekday === w &&
      a.recurring &&
      (!a.valid_from || date >= a.valid_from) &&
      (!a.valid_until || date <= a.valid_until),
  );
  if (base.length === 0) return null;
  if (base.some((row) => row.is_available === false)) return [];

  const hard = base
    .filter((row) => row.is_available && row.priority === "normal")
    .map((row) => ({
      start: toMin(row.start_time),
      end: toMin(row.end_time),
      priority: "normal" as const,
    }))
    .filter((window) => window.start < window.end);
  if (hard.length === 0) return null;

  // Preference rows are retained for scoring, but clipped to normal windows so
  // they can never make a hard-unavailable time feasible.
  const preferred = base
    .filter((row) => row.is_available && row.priority === "high")
    .flatMap((row) => {
      const preferredStart = toMin(row.start_time);
      const preferredEnd = toMin(row.end_time);
      return hard.flatMap((normal) => {
        const start = Math.max(preferredStart, normal.start);
        const end = Math.min(preferredEnd, normal.end);
        return start < end
          ? [{ start, end, priority: "high" as const }]
          : [];
      });
    });

  return [...hard, ...preferred].sort((left, right) => (
    left.start - right.start
    || left.end - right.end
    || (left.priority === "normal" ? -1 : 1)
  ));
}

/** Is [start,end) fully inside at least one window? */
export function insideAny(
  start: number,
  end: number,
  windows: Window[],
): boolean {
  return windows.some((w) => start >= w.start && end <= w.end);
}

/** Index of the window containing [start,end), or -1. */
export function windowIndex(
  start: number,
  end: number,
  windows: Window[],
): number {
  return windows.findIndex((w) => start >= w.start && end <= w.end);
}
