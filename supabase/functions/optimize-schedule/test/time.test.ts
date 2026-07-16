import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { effectiveAvailability, insideAny } from "../solver/time.ts";
import type { PatientAvailability, PatientException } from "../solver/types.ts";

const patientId = "patient-1";
const date = "2026-07-20";

function exception(
  start_time: string | null,
  end_time: string | null,
  is_available = true,
): PatientException {
  return {
    patient_id: patientId,
    exception_date: date,
    is_available,
    start_time,
    end_time,
  };
}

Deno.test("effectiveAvailability unions every matching timed date exception", () => {
  const windows = effectiveAvailability(patientId, date, [], [
    exception("09:00", "10:00"),
    exception("14:00", "16:00"),
  ]);

  assertEquals(windows, [
    { start: 540, end: 600, priority: "normal" },
    { start: 840, end: 960, priority: "normal" },
  ]);
  assertEquals(insideAny(870, 930, windows ?? []), true);
});

Deno.test("a full-date blackout wins over every timed exception", () => {
  const windows = effectiveAvailability(patientId, date, [], [
    exception("09:00", "10:00"),
    exception(null, null, false),
    exception("14:00", "16:00"),
  ]);

  assertEquals(windows, []);
});

Deno.test("timed date exceptions replace recurring weekday availability", () => {
  const recurring: PatientAvailability[] = [{
    patient_id: patientId,
    weekday: "monday",
    start_time: "08:00",
    end_time: "12:00",
    priority: "high",
    valid_from: null,
    valid_until: null,
    recurring: true,
  }];

  const windows = effectiveAvailability(patientId, date, recurring, [
    exception("14:00", "16:00"),
    exception("17:00", "18:00"),
  ]);

  assertEquals(windows, [
    { start: 840, end: 960, priority: "normal" },
    { start: 1020, end: 1080, priority: "normal" },
  ]);
  assertEquals(insideAny(540, 570, windows ?? []), false);
  assertEquals(insideAny(1035, 1065, windows ?? []), true);
});
