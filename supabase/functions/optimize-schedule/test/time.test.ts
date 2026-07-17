/// <reference lib="deno.ns" />

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

function recurring(
  weekday: PatientAvailability["weekday"],
  start_time: string,
  end_time: string,
  priority: PatientAvailability["priority"] = "normal",
  is_available = true,
): PatientAvailability {
  return {
    patient_id: patientId,
    weekday,
    start_time,
    end_time,
    priority,
    is_available,
    valid_from: null,
    valid_until: null,
    recurring: true,
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
  const weekly = [recurring("monday", "08:00", "12:00", "high")];

  const windows = effectiveAvailability(patientId, date, weekly, [
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

Deno.test("missing recurring rows preserve legacy flexibility", () => {
  assertEquals(effectiveAvailability(patientId, date, [], []), null);
});

Deno.test("an explicit unavailable recurring row blocks the weekday", () => {
  const windows = effectiveAvailability(patientId, date, [
    recurring("monday", "00:00", "23:59", "normal", false),
  ], []);

  assertEquals(windows, []);
});

Deno.test("the six recurring states map to the expected hard and soft windows", () => {
  const cases: Array<{
    name: string;
    rows: PatientAvailability[];
    expected: ReturnType<typeof effectiveAvailability>;
  }> = [
    {
      name: "unavailable",
      rows: [recurring("monday", "00:00", "23:59", "normal", false)],
      expected: [],
    },
    {
      name: "all day",
      rows: [
        recurring("monday", "08:00", "12:30"),
        recurring("monday", "14:00", "19:00"),
      ],
      expected: [
        { start: 480, end: 750, priority: "normal" },
        { start: 840, end: 1140, priority: "normal" },
      ],
    },
    {
      name: "morning only",
      rows: [recurring("monday", "08:00", "12:30")],
      expected: [{ start: 480, end: 750, priority: "normal" }],
    },
    {
      name: "afternoon only",
      rows: [recurring("monday", "14:00", "19:00")],
      expected: [{ start: 840, end: 1140, priority: "normal" }],
    },
    {
      name: "prefer morning",
      rows: [
        recurring("monday", "08:00", "12:30"),
        recurring("monday", "14:00", "19:00"),
        recurring("monday", "08:00", "12:30", "high"),
      ],
      expected: [
        { start: 480, end: 750, priority: "normal" },
        { start: 480, end: 750, priority: "high" },
        { start: 840, end: 1140, priority: "normal" },
      ],
    },
    {
      name: "prefer afternoon",
      rows: [
        recurring("monday", "08:00", "12:30"),
        recurring("monday", "14:00", "19:00"),
        recurring("monday", "14:00", "19:00", "high"),
      ],
      expected: [
        { start: 480, end: 750, priority: "normal" },
        { start: 840, end: 1140, priority: "normal" },
        { start: 840, end: 1140, priority: "high" },
      ],
    },
  ];

  for (const testCase of cases) {
    assertEquals(
      effectiveAvailability(patientId, date, testCase.rows, []),
      testCase.expected,
      testCase.name,
    );
  }
});

Deno.test("high-priority rows never expand hard feasibility", () => {
  const windows = effectiveAvailability(patientId, date, [
    recurring("monday", "09:00", "12:00"),
    recurring("monday", "14:00", "18:00", "high"),
  ], []);

  assertEquals(windows, [
    { start: 540, end: 720, priority: "normal" },
  ]);
  assertEquals(insideAny(840, 900, windows ?? []), false);
});

Deno.test("nested high-priority rows remain available to preference scoring", () => {
  const windows = effectiveAvailability(patientId, date, [
    recurring("monday", "09:00", "13:00"),
    recurring("monday", "14:00", "18:00"),
    recurring("monday", "09:00", "13:00", "high"),
  ], []);

  assertEquals(windows?.filter((window) => window.priority === "high"), [
    { start: 540, end: 780, priority: "high" },
  ]);
  assertEquals(insideAny(870, 930, windows ?? []), true);
});
