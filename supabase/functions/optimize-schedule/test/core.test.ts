/// <reference lib="deno.ns" />

// Offline tests for solveCore against fixtures. Run: `deno test`.
// No network, no DB. Asserts hard-constraint validity, idle non-increase,
// move-budget enforcement, and waiting-list fill behavior.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findHardViolation, runFreePeriod, runSolver } from "../solver/core.ts";
import { capacityWindows, dayDiff } from "../solver/time.ts";
import type { SolverInput } from "../solver/types.ts";

interface TestTravelLeg {
  seconds: number;
  meters: number;
  mode: "studio" | "fallback" | "foot-walking" | "driving-car";
  verifiable: boolean;
}

type RoutedTestInput = SolverInput & {
  studio_location_key: string;
  travel_matrix: Record<string, Record<string, TestTravelLeg>>;
  location_coords?: Record<string, { latitude: number; longitude: number }>;
};

async function load(name: string): Promise<SolverInput> {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(url)) as SolverInput;
}

async function routedBase(): Promise<RoutedTestInput> {
  const input = structuredClone(
    await load("g_intrablock_exact.json"),
  ) as RoutedTestInput;
  input.studio_location_key = "studio";
  input.travel_matrix = {};
  input.context.settings.allow_waiting_list = false;
  input.context.settings.max_solver_seconds = 0;
  return input;
}

function setLocation(
  input: RoutedTestInput,
  appointmentId: string,
  locationKey: string,
): void {
  const appointment = input.appointments.find((item) =>
    item.id === appointmentId
  );
  assert(appointment, `missing appointment ${appointmentId}`);
  (appointment as typeof appointment & { location_key: string }).location_key =
    locationKey;
}

function setLeg(
  input: RoutedTestInput,
  from: string,
  to: string,
  minutes: number,
  verifiable = true,
): void {
  input.travel_matrix[from] ??= {};
  input.travel_matrix[from][to] = {
    seconds: minutes * 60,
    meters: minutes * 100,
    mode: minutes === 0 ? "studio" : "driving-car",
    verifiable,
  };
}

function lockAll(input: RoutedTestInput): void {
  for (const appointment of input.appointments) appointment.locked = true;
}

function toMin(t: string): number {
  const p = t.split(":");
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

/** Move budgets must hold on the final schedule. */
function assertBudgets(input: SolverInput, res: ReturnType<typeof runSolver>) {
  const S = input.context.settings;
  const perPatient = new Map<string, number>();
  const perDay = new Map<string, number>();
  const origin = new Map(
    input.appointments.map((a) => [
      a.id,
      { date: a.appointment_date, start: toMin(a.start_time) },
    ]),
  );
  for (const s of res.slots) {
    const o = origin.get(s.id);
    if (o && (o.date !== s.date || o.start !== s.start)) {
      perPatient.set(s.patient_id, (perPatient.get(s.patient_id) ?? 0) + 1);
      perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1);
    }
  }
  for (const v of perPatient.values()) assert(v <= S.max_patient_moves);
  for (const v of perDay.values()) assert(v <= S.max_daily_moves);
}

Deno.test("A: interstitial gap is compacted, idle drops, schedule valid", async () => {
  const input = await load("a_interstitial_gap.json");
  const res = runSolver(input);

  assertEquals(findHardViolation(input, res.slots), null);
  assert(res.idleAfter < res.idleBefore, "idle should strictly drop");
  assert(res.idleAfter <= res.idleBefore);
  assert(
    res.output.changes.some((c) => c.kind === "move"),
    "expected a move change",
  );
  assertBudgets(input, res);
});

Deno.test("B: exception override respected, blackout blocks WL, valid", async () => {
  const input = await load("b_patient_blackout.json");
  const res = runSolver(input);

  assertEquals(findHardViolation(input, res.slots), null);
  assert(res.idleAfter <= res.idleBefore);

  // pat-y may only be scheduled inside its 11:00-13:00 exception override
  const y = res.slots.find((s) => s.id === "appt-y")!;
  assert(y.start >= toMin("11:00"), `pat-y start ${y.start} must be >= 11:00`);
  assert(y.start + y.dur <= toMin("13:00"));

  // pat-b has a full-day blackout -> its WL entry must not be placed
  assertEquals(res.output.run.created_appointments, 0);
  assert(!res.output.changes.some((c) => c.patient_id === "pat-b"));
  assertBudgets(input, res);
});

Deno.test("C: waiting-list entry fills residual gap as a create", async () => {
  const input = await load("c_waiting_list_fill.json");
  const res = runSolver(input);

  assertEquals(findHardViolation(input, res.slots), null);
  assertEquals(res.output.run.created_appointments, 1);
  const create = res.output.changes.find((c) => c.kind === "create");
  assert(create, "expected a create change");
  assertEquals(create!.patient_id, "pat-w");
  assertEquals(create!.appointment_id, null);
  assertEquals(create!.old_date, null);
  assertBudgets(input, res);
});

Deno.test("D: midweek holiday closes the day + split-day blocks an afternoon WL fill", async () => {
  const input = await load("d_holiday_and_split.json");
  const res = runSolver(input);

  assertEquals(findHardViolation(input, res.slots), null);

  // 2026-07-14 (Tuesday) is a holiday -> no capacity windows, nothing scheduled
  assertEquals(
    capacityWindows("2026-07-14", input.working_hours, input.holidays).length,
    0,
  );
  assert(!res.slots.some((s) => s.date === "2026-07-14"));

  // Neither WL entry can be placed:
  //  - wl-w-tuesday: only Tuesday, which is a holiday
  //  - wl-x-afternoon: allow_split_days=false and pat-x already has a morning
  //    appointment, so an afternoon slot would split the day -> forbidden
  assertEquals(res.output.run.created_appointments, 0);
  assert(!res.slots.some((s) => s.created));
  assert(
    !res.slots.some((s) => s.patient_id === "pat-x" && s.start >= toMin("14:00")),
    "pat-x must not get an afternoon slot under allow_split_days=false",
  );

  // The solver still works around the constraints: pat-q's late appointment is
  // compacted earlier, recovering idle.
  assert(res.idleAfter < res.idleBefore, "compaction should still recover idle");
  assert(res.output.changes.some((c) => c.kind === "move" && c.patient_id === "pat-q"));
  assertBudgets(input, res);
});

Deno.test("E: cross-lunch gap is compacted (morning + afternoon appt, ~2h buco)", async () => {
  const input = await load("e_cross_lunch_gap.json");
  const res = runSolver(input);

  // schedule stays valid
  assertEquals(findHardViolation(input, res.slots), null);

  // the visible gap between the morning appt (occ ends 11:55) and the afternoon
  // appt (14:00) is recoverable idle, net of the 13:00-14:00 lunch:
  // (14:00 - 11:55) - 60 = 65 min. Must be counted (not 0), and closing it by
  // pulling the afternoon appt into the morning must strictly drop idle.
  assertEquals(res.idleBefore, 65, "cross-lunch gap must count as idle (net of lunch)");
  assert(
    res.output.changes.some((c) => c.kind === "move"),
    "expected at least 1 move to close the cross-lunch gap",
  );
  assert(
    res.idleAfter < res.idleBefore,
    `idle should strictly drop (before=${res.idleBefore}, after=${res.idleAfter})`,
  );
  assertBudgets(input, res);
});

Deno.test("F: intra-block gap (two morning appts, 2h buco) is compacted", async () => {
  const input = await load("f_intrablock_gap.json");
  const res = runSolver(input);

  assertEquals(findHardViolation(input, res.slots), null);

  // appt-1 occ ends 09:40, appt-2 starts 11:30, same morning block, no closure
  // in between -> recoverable idle = 110 min. Pulling appt-2 right after appt-1
  // must reduce that gap, so idle strictly drops and a move is proposed.
  assertEquals(res.idleBefore, 110, "intra-block gap must count as idle");
  assert(
    res.output.changes.some((c) => c.kind === "move"),
    "expected a move to compact the intra-block gap",
  );
  assert(
    res.idleAfter < res.idleBefore,
    `idle should strictly drop (before=${res.idleBefore}, after=${res.idleAfter})`,
  );
  assertBudgets(input, res);
});

Deno.test("G: exact intra-block case (09:00-09:30 + 11:30-12:00, no buffer) compacts", async () => {
  // Real production repro: two appointments in the SAME morning window
  // (09:00-13:00), no patient availability, no buffers. The 120-min gap between
  // them is fully recoverable idle. The solver must pull appt-2 right after
  // appt-1 (to 09:30), dropping idle 120 -> 0 with exactly one move. Production
  // returning idle_after=120 / moved=0 means a stale deployed function.
  const input = await load("g_intrablock_exact.json");
  const res = runSolver(input);

  assertEquals(findHardViolation(input, res.slots), null);
  assertEquals(res.idleBefore, 120, "the intra-block gap is 120 min of idle");
  assertEquals(res.idleAfter, 0, "compaction must close the whole gap");

  const moves = res.output.changes.filter((c) => c.kind === "move");
  assertEquals(moves.length, 1, "exactly one move expected");
  assertEquals(moves[0].appointment_id, "appt-2");
  assertEquals(moves[0].new_start_time, "09:30:00");
  assertEquals(res.output.run.moved_appointments, 1);
  assertBudgets(input, res);
});

Deno.test("high availability preference changes solver selection without changing feasibility", async () => {
  const preferred = await load("g_intrablock_exact.json");
  preferred.context.settings.weight_patient_preference = 1000;
  preferred.patient_availability = [
    {
      patient_id: "pat-b",
      weekday: "monday",
      start_time: "00:00:00",
      end_time: "24:00:00",
      priority: "normal",
      is_available: true,
      valid_from: null,
      valid_until: null,
      recurring: true,
    },
    {
      patient_id: "pat-b",
      weekday: "monday",
      start_time: "11:00:00",
      end_time: "13:00:00",
      priority: "high",
      is_available: true,
      valid_from: null,
      valid_until: null,
      recurring: true,
    },
  ];

  const ignored = structuredClone(preferred);
  ignored.context.settings.weight_patient_preference = 0;

  const preferredResult = runSolver(preferred);
  const ignoredResult = runSolver(ignored);
  const preferredSlot = preferredResult.slots.find((slot) => slot.id === "appt-2");
  const ignoredSlot = ignoredResult.slots.find((slot) => slot.id === "appt-2");

  assertEquals(findHardViolation(preferred, preferredResult.slots), null);
  assertEquals(findHardViolation(ignored, ignoredResult.slots), null);
  assertEquals(preferredSlot?.start, toMin("11:00"));
  assertEquals(ignoredSlot?.start, toMin("09:30"));
});

Deno.test("H: advance pre-pass pulls a 'move me up' client into an earlier slot", async () => {
  const input = await load("h_advance.json")
  const res = runSolver(input)

  assertEquals(findHardViolation(input, res.slots), null)

  // pat-a's far appointment (2026-07-20) should be moved at least 3 days earlier.
  const far = res.slots.find((s) => s.id === "appt-far")!
  assert(far.date < "2026-07-20", `expected an earlier date, got ${far.date}`)
  const dayMs = 86400000
  const earlierBy = (Date.parse("2026-07-20") - Date.parse(far.date)) / dayMs
  assert(earlierBy >= 3, `must be >= 3 days earlier, was ${earlierBy}`)

  // It shows up as a move (not a waiting-list create) for that appointment.
  const move = res.output.changes.find((c) => c.kind === "move" && c.appointment_id === "appt-far")
  assert(move, "expected a move for the advanced appointment")
  assertEquals(res.output.run.created_appointments, 0)
})

Deno.test("I: month moves stay in their week unless cross-week is enabled", async () => {
  const isolated = await load("i_month_week_isolation.json")
  const isolatedResult = runSolver(isolated)
  const isolatedSlot = isolatedResult.slots.find((slot) => slot.id === "appt-week")!
  assertEquals(isolatedSlot.date, "2026-07-13")

  const enabled = structuredClone(isolated)
  enabled.context.allow_cross_week = true
  enabled.context.max_cross_week_days = 7
  const enabledResult = runSolver(enabled)
  const moved = enabledResult.slots.find((slot) => slot.id === "appt-week")!
  assertEquals(moved.date, "2026-07-10")
  assert(Math.abs(dayDiff("2026-07-13", moved.date)) <= 7)
})

Deno.test("routing rejects consecutive appointments without enough travel time", async () => {
  const input = await routedBase();
  input.appointments[1].start_time = "09:40";
  input.appointments[1].end_time = "10:10";
  setLocation(input, "appt-1", "patient-a");
  setLocation(input, "appt-2", "patient-b");
  setLeg(input, "studio", "patient-a", 0);
  setLeg(input, "patient-a", "patient-b", 15);
  setLeg(input, "patient-b", "studio", 0);
  lockAll(input);

  const violation = findHardViolation(input, runSolver(input).slots);
  assert(
    violation?.includes("travel"),
    `expected a travel violation, got ${violation}`,
  );
});

Deno.test("routing accepts a consecutive leg fully absorbed by lunch", async () => {
  const input = await routedBase();
  input.appointments[0].start_time = "12:30";
  input.appointments[0].end_time = "13:00";
  input.appointments[1].start_time = "14:00";
  input.appointments[1].end_time = "14:30";
  setLocation(input, "appt-1", "patient-a");
  setLocation(input, "appt-2", "patient-b");
  setLeg(input, "studio", "patient-a", 0);
  setLeg(input, "patient-a", "patient-b", 60);
  setLeg(input, "patient-b", "studio", 0);
  lockAll(input);

  assertEquals(findHardViolation(input, runSolver(input).slots), null);
});

Deno.test("routing: edge legs (studio->first, last->studio) are cost-only, never block (spec §3.6)", async () => {
  // Old behaviour blocked when the first/last studio leg didn't fit the window.
  // Spec §3.6: edge legs count only in Travel, they never constrain the times —
  // the day must not "wait" for the drive from home. So no hard violation.
  const first = await routedBase();
  first.appointments = [first.appointments[0]];
  first.appointments[0].start_time = "09:05";
  first.appointments[0].end_time = "09:35";
  setLocation(first, "appt-1", "patient-a");
  setLeg(first, "studio", "patient-a", 10);
  setLeg(first, "patient-a", "studio", 0);
  lockAll(first);
  assertEquals(findHardViolation(first, runSolver(first).slots), null);

  const last = await routedBase();
  last.appointments = [last.appointments[0]];
  last.appointments[0].start_time = "17:20";
  last.appointments[0].end_time = "17:50";
  setLocation(last, "appt-1", "patient-a");
  setLeg(last, "studio", "patient-a", 0);
  setLeg(last, "patient-a", "studio", 15);
  lockAll(last);
  assertEquals(findHardViolation(last, runSolver(last).slots), null);
});

Deno.test("routing: a missing/unverifiable leg is estimated, never freezes the day (spec §3)", async () => {
  // Old behaviour returned a hard "unavailable" violation on an unverifiable
  // leg. Spec §3: fall back to an estimate; a missing leg never makes a day
  // infeasible. The estimate fits the 09:30->11:30 gap → no violation.
  const input = await routedBase();
  setLocation(input, "appt-1", "patient-a");
  setLocation(input, "appt-2", "patient-b");
  setLeg(input, "studio", "patient-a", 0);
  setLeg(input, "patient-a", "patient-b", 0, false);
  setLeg(input, "patient-b", "studio", 0);
  lockAll(input);

  assertEquals(findHardViolation(input, runSolver(input).slots), null);
});

Deno.test("routing: two appts sharing the same location key travel in 0, never blocks (spec §1/§3)", async () => {
  // Old behaviour special-cased the "unresolved:" prefix and blocked. That
  // prefix hack is gone: same key => t = 0 (spec §1), and no leg ever freezes
  // a day (spec §3).
  const input = await routedBase();
  input.appointments[0].start_time = "09:20";
  input.appointments[0].end_time = "09:50";
  setLocation(input, "appt-1", "unresolved:patient");
  setLocation(input, "appt-2", "unresolved:patient");
  setLeg(input, "studio", "unresolved:patient", 20);
  setLeg(input, "unresolved:patient", "unresolved:patient", 0);
  setLeg(input, "unresolved:patient", "studio", 20);
  lockAll(input);

  assertEquals(findHardViolation(input, runSolver(input).slots), null);
});

Deno.test("routing idle subtracts required travel from an open gap", async () => {
  const input = await routedBase();
  input.appointments[1].start_time = "10:30";
  input.appointments[1].end_time = "11:00";
  setLocation(input, "appt-1", "patient-a");
  setLocation(input, "appt-2", "patient-b");
  setLeg(input, "studio", "patient-a", 0);
  setLeg(input, "patient-a", "patient-b", 20);
  setLeg(input, "patient-b", "studio", 0);
  lockAll(input);

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  assertEquals(result.idleBefore, 40);
  assertEquals(result.idleAfter, 40);
});

Deno.test("routing candidates compact to predecessor end plus travel", async () => {
  const input = await routedBase();
  setLocation(input, "appt-1", "patient-a");
  setLocation(input, "appt-2", "patient-b");
  setLeg(input, "studio", "patient-a", 0);
  setLeg(input, "patient-a", "patient-b", 20);
  setLeg(input, "patient-b", "studio", 0);

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  const move = result.output.changes.find((change) =>
    change.appointment_id === "appt-2"
  );
  assert(move, "expected the second appointment to be compacted");
  assertEquals(move.new_start_time, "09:50:00");
});

// Re-enabled in FASE 2: the exact per-day DP (spec §6) restores the true day
// optimum (Travel 30 at 14:00) that the greedy local search missed (11:45,
// Travel 35). This is the acceptance criterion for the refinement.
Deno.test("routing preserves an afternoon window boundary when lunch absorbs predecessor travel", async () => {
  const input = await routedBase();
  input.appointments[0].start_time = "12:30";
  input.appointments[0].end_time = "13:00";
  input.appointments[0].locked = true;
  input.appointments[1].start_time = "15:00";
  input.appointments[1].end_time = "15:30";
  setLocation(input, "appt-1", "patient-a");
  setLocation(input, "appt-2", "patient-b");
  setLeg(input, "studio", "patient-a", 0);
  setLeg(input, "studio", "patient-b", 20);
  setLeg(input, "patient-a", "patient-b", 30);
  setLeg(input, "patient-b", "studio", 0);

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  const move = result.output.changes.find((change) =>
    change.appointment_id === "appt-2"
  );
  assert(move, "expected the afternoon appointment to compact to reopening");
  assertEquals(move.new_start_time, "14:00:00");
});

Deno.test("routing keeps the successor boundary available for waiting-list insertion", async () => {
  const input = await routedBase();
  input.appointments = [input.appointments[1]];
  input.appointments[0].start_time = "11:00";
  input.appointments[0].end_time = "11:30";
  input.appointments[0].locked = true;
  setLocation(input, "appt-2", "patient-b");
  input.context.settings.allow_waiting_list = true;
  input.waiting_list = [{
    id: "wl-successor",
    patient_id: "pat-a",
    preferred_service_id: "svc-1",
    priority: "high",
    earliest_date: "2026-07-13",
    latest_date: "2026-07-13",
    preferred_weekdays: ["monday"],
    earliest_time: "10:10",
    latest_time: "11:00",
    preferred_duration_minutes: 30,
    flexible: false,
  }];
  setLeg(input, "studio", "studio", 0);
  setLeg(input, "studio", "patient-b", 20);
  setLeg(input, "patient-b", "studio", 0);

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  const create = result.output.changes.find((change) =>
    change.kind === "create" && change.patient_id === "pat-a"
  );
  assert(create, "expected a waiting-list insertion before the successor");
  assertEquals(create.new_start_time, "10:10:00");
});

Deno.test("FASE 2 (§9 fixture a): the solver reorders two clients to cut travel", async () => {
  // The "map vs solver" case that failed before FASE 2: time-sorted order is
  // a→b, but geography makes b→a much cheaper. With travel in the objective and
  // the exact per-day DP, the solver must reorder so b is visited first.
  const input = await routedBase();
  input.appointments[0].start_time = "09:00"; // a
  input.appointments[0].end_time = "09:30";
  input.appointments[1].start_time = "11:30"; // b
  input.appointments[1].end_time = "12:00";
  setLocation(input, "appt-1", "patient-a");
  setLocation(input, "appt-2", "patient-b");
  // studio→a→b→studio = 30+5+30 = 65 ; studio→b→a→studio = 5+5+5 = 15
  setLeg(input, "studio", "patient-a", 30);
  setLeg(input, "studio", "patient-b", 5);
  setLeg(input, "patient-a", "patient-b", 5);
  setLeg(input, "patient-b", "patient-a", 5);
  setLeg(input, "patient-a", "studio", 5);
  setLeg(input, "patient-b", "studio", 30);

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  const a = result.slots.find((s) => s.id === "appt-1")!;
  const b = result.slots.find((s) => s.id === "appt-2")!;
  assert(
    b.start < a.start,
    `expected b reordered before a to cut travel, got a@${a.start} b@${b.start}`,
  );
});

Deno.test("FASE 2 (§4): a movable appointment slides later to hug a late anchor, closing idle", async () => {
  // a is free from the morning; b is pinned at 11:00. Left-justify puts a at
  // 09:00, leaving a 90' gap that pulling-earlier cannot remove. The backward
  // gap-closing pass must delay a to hug b (a ends exactly when b starts).
  const input = await routedBase();
  input.appointments[0].start_time = "09:00"; // a, movable
  input.appointments[0].end_time = "09:30";
  input.appointments[1].start_time = "11:00"; // b, locked anchor
  input.appointments[1].end_time = "11:30";
  input.appointments[1].locked = true;
  setLocation(input, "appt-1", "patient-a");
  setLocation(input, "appt-2", "patient-b");
  // Travel breaks the tie so the order a→b (b last) is the unique optimum;
  // otherwise b→a would be an equal-cost placement of a after b.
  setLeg(input, "studio", "patient-a", 0);
  setLeg(input, "studio", "patient-b", 0);
  setLeg(input, "patient-a", "patient-b", 0);
  setLeg(input, "patient-b", "patient-a", 60);
  setLeg(input, "patient-a", "studio", 0);
  setLeg(input, "patient-b", "studio", 0);

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  const a = result.slots.find((s) => s.id === "appt-1")!;
  // hug b: occEnd(a) == occStart(b) == 11:00, travel 0 → a starts 10:30 (630).
  assertEquals(a.start, toMin("10:30"));
});

Deno.test("FASE 3 (§9 fixture b): a pool plan places its sittings respecting the 48h gap", async () => {
  const input = await routedBase();
  input.appointments = [];
  input.context.date_from = "2026-07-13"; // Mon
  input.context.date_to = "2026-07-17"; // Fri
  input.context.settings.allow_waiting_list = true;
  input.waiting_list = [{
    id: "pool-1",
    patient_id: "pat-pool",
    preferred_service_id: null,
    priority: "normal",
    earliest_date: "2026-07-13",
    latest_date: "2026-07-17",
    preferred_weekdays: null,
    earliest_time: null,
    latest_time: null,
    preferred_duration_minutes: 60,
    flexible: true,
    pool: { sessions_total: 2, max_per_week: 2, gap_hours: 48 },
  }];

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  const creates = result.output.changes.filter(
    (c) => c.kind === "create" && c.patient_id === "pat-pool",
  );
  assertEquals(creates.length, 2, "both sittings should be planned");
  const ms = creates
    .map((c) => Date.parse(`${c.new_date}T${c.new_start_time}Z`))
    .sort((a, b) => a - b);
  assert(
    ms[1] - ms[0] >= 48 * 3_600_000,
    `sittings must be ≥48h apart, got ${(ms[1] - ms[0]) / 3_600_000}h`,
  );
});

Deno.test("FASE 3 (§7): max_per_week caps a pool plan and leaves the rest in the pool", async () => {
  const input = await routedBase();
  input.appointments = [];
  input.context.date_from = "2026-07-13"; // Mon
  input.context.date_to = "2026-07-17"; // Fri (single ISO week)
  input.context.settings.allow_waiting_list = true;
  input.waiting_list = [{
    id: "pool-cap",
    patient_id: "pat-cap",
    preferred_service_id: null,
    priority: "normal",
    earliest_date: "2026-07-13",
    latest_date: "2026-07-17",
    preferred_weekdays: null,
    earliest_time: null,
    latest_time: null,
    preferred_duration_minutes: 60,
    flexible: true,
    pool: { sessions_total: 2, max_per_week: 1, gap_hours: 0 },
  }];

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  const creates = result.output.changes.filter(
    (c) => c.kind === "create" && c.patient_id === "pat-cap",
  );
  // Only one sitting fits the single week (max_per_week=1); the other stays in
  // the pool — explicit partial success.
  assertEquals(creates.length, 1);
});

Deno.test("FASE 1/4 (§9 fixture d): changing L_start changes the visiting order", async () => {
  // Two movable clients. With the day starting at the studio (near a) the
  // optimum visits a first; starting from home (near b) flips it to b first —
  // the edge leg L_start→first is counted in Travel and steers the sequence.
  const build = async (startKey: string | undefined) => {
    const input = await routedBase();
    input.appointments[0].start_time = "09:00"; // a
    input.appointments[0].end_time = "09:30";
    input.appointments[1].start_time = "11:30"; // b
    input.appointments[1].end_time = "12:00";
    setLocation(input, "appt-1", "patient-a");
    setLocation(input, "appt-2", "patient-b");
    setLeg(input, "studio", "patient-a", 1);
    setLeg(input, "studio", "patient-b", 60);
    setLeg(input, "home", "patient-a", 60);
    setLeg(input, "home", "patient-b", 1);
    setLeg(input, "patient-a", "patient-b", 10);
    setLeg(input, "patient-b", "patient-a", 10);
    setLeg(input, "patient-a", "studio", 1);
    setLeg(input, "patient-b", "studio", 1);
    if (startKey) input.start_location_key = startKey;
    return runSolver(input);
  };

  const fromStudio = await build(undefined);
  const a1 = fromStudio.slots.find((s) => s.id === "appt-1")!;
  const b1 = fromStudio.slots.find((s) => s.id === "appt-2")!;
  assert(a1.start < b1.start, "from the studio, a should be visited first");

  const fromHome = await build("home");
  const a2 = fromHome.slots.find((s) => s.id === "appt-1")!;
  const b2 = fromHome.slots.find((s) => s.id === "appt-2")!;
  assert(b2.start < a2.start, "from home, b should be visited first");
});

Deno.test("FASE 1 (§9 fixture f): consecutive studio appointments travel in 0 (no phantom cost)", async () => {
  // Two studio appointments scheduled back-to-back (09:30 == 09:30). If a studio
  // studio leg cost anything, the adjacency would be infeasible. It stays valid,
  // proving t = 0 between two studio appointments.
  const input = await routedBase();
  input.appointments[0].start_time = "09:00";
  input.appointments[0].end_time = "09:30";
  input.appointments[1].start_time = "09:30";
  input.appointments[1].end_time = "10:00";
  // No setLocation → both default to the studio key.
  lockAll(input);
  assertEquals(findHardViolation(input, runSolver(input).slots), null);
});

Deno.test("FASE 2 (§9 fixture e): the DP finds a hand-built 3-stop optimum", async () => {
  // Time-sorted order is a→b→c but geography makes a→c→b far cheaper (10 vs 105).
  // The exact per-day DP must find the a→c→b sequence.
  const input = await routedBase();
  const third = structuredClone(input.appointments[1]);
  third.id = "appt-3";
  third.patient_id = "patient-c";
  third.start_time = "11:00";
  third.end_time = "11:30";
  input.appointments[0].start_time = "09:00"; // a
  input.appointments[0].end_time = "09:30";
  input.appointments[1].start_time = "10:00"; // b
  input.appointments[1].end_time = "10:30";
  input.appointments.push(third); // c
  setLocation(input, "appt-1", "patient-a");
  setLocation(input, "appt-2", "patient-b");
  setLocation(input, "appt-3", "patient-c");
  setLeg(input, "studio", "patient-a", 0);
  setLeg(input, "patient-a", "patient-c", 5);
  setLeg(input, "patient-c", "patient-b", 5);
  setLeg(input, "patient-b", "studio", 0);
  setLeg(input, "patient-a", "patient-b", 50);
  setLeg(input, "patient-b", "patient-c", 50);
  setLeg(input, "patient-c", "patient-a", 5);

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  const a = result.slots.find((s) => s.id === "appt-1")!;
  const b = result.slots.find((s) => s.id === "appt-2")!;
  const c = result.slots.find((s) => s.id === "appt-3")!;
  assert(a.start < c.start && c.start < b.start, "expected order a → c → b");
});

Deno.test("FASE 2 (§5): a >13-appointment day is reordered by 2-OPT/SWAP", async () => {
  // 14 appointments (DP skipped). All at the studio except the last two, a and b,
  // whose edge leg to the studio differs: visiting a last is far cheaper, so the
  // local 2-OPT/SWAP pass must swap them (b before a).
  const input = await routedBase();
  const template = structuredClone(input.appointments[0]);
  const appts: any[] = [];
  const hhmm = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  // 12 studio fillers in the morning, 20' apart.
  for (let i = 0; i < 12; i++) {
    const a = structuredClone(template);
    a.id = `fill-${i}`;
    a.patient_id = `pf-${i}`;
    a.start_time = hhmm(540 + i * 20); // from 09:00
    a.end_time = hhmm(540 + i * 20 + 15);
    a.duration_minutes = 15;
    appts.push(a);
  }
  const mk = (id: string, pid: string, start: number) => {
    const a = structuredClone(template);
    a.id = id;
    a.patient_id = pid;
    a.start_time = hhmm(start);
    a.end_time = hhmm(start + 15);
    a.duration_minutes = 15;
    return a;
  };
  appts.push(mk("appt-a", "patient-a", 840)); // 14:00
  appts.push(mk("appt-b", "patient-b", 860)); // 14:20 (b last by time)
  input.appointments = appts;
  input.context.settings.max_daily_moves = 0; // unlimited (spec default)
  input.context.settings.max_patient_moves = 0;
  setLocation(input, "appt-a", "patient-a");
  setLocation(input, "appt-b", "patient-b");
  setLeg(input, "studio", "patient-a", 1);
  setLeg(input, "studio", "patient-b", 1);
  setLeg(input, "patient-a", "patient-b", 1);
  setLeg(input, "patient-b", "patient-a", 1);
  setLeg(input, "patient-a", "studio", 1); // a → home cheap
  setLeg(input, "patient-b", "studio", 30); // b → home expensive

  const result = runSolver(input);
  assertEquals(findHardViolation(input, result.slots), null);
  const a = result.slots.find((s) => s.id === "appt-a")!;
  const b = result.slots.find((s) => s.id === "appt-b")!;
  assert(b.start < a.start, `expected b before a after SWAP, got a@${a.start} b@${b.start}`);
});

Deno.test("routing results stay deterministic for a fixed candidate budget", async () => {
  const first = await routedBase();
  first.context.settings.max_solver_seconds = 30;
  setLocation(first, "appt-1", "patient-a");
  setLocation(first, "appt-2", "patient-b");
  setLeg(first, "studio", "patient-a", 0);
  setLeg(first, "patient-a", "patient-b", 20);
  setLeg(first, "patient-b", "studio", 0);
  const second = structuredClone(first);

  const firstResult = runSolver(first);
  const secondResult = runSolver(second);
  assertEquals(firstResult.output.changes, secondResult.output.changes);
  assertEquals(firstResult.idleBefore, secondResult.idleBefore);
  assertEquals(firstResult.idleAfter, secondResult.idleAfter);
});

Deno.test("determinism: same input yields identical output", async () => {
  const input = await load("a_interstitial_gap.json");
  const r1 = runSolver(input);
  const r2 = runSolver(await load("a_interstitial_gap.json"));
  assertEquals(
    JSON.stringify(r1.output.changes),
    JSON.stringify(r2.output.changes),
  );
});

Deno.test("J: freeing a whole day relocates every appointment off it", async () => {
  const input = await load("j_free_period.json");
  const res = runFreePeriod(input, {
    date: "2026-07-15",
    startMinute: 0,
    endMinute: 24 * 60,
  });
  assertEquals(res.completion, "complete");
  assertEquals(res.blockers.length, 0);
  // No appointment remains on the freed day.
  const moves = res.output.changes.filter((c) => c.kind === "move");
  assertEquals(moves.length, 2);
  for (const m of moves) assert(m.new_date !== "2026-07-15");
});

Deno.test("J: freeing the afternoon moves only the afternoon appointment", async () => {
  const input = await load("j_free_period.json");
  const res = runFreePeriod(input, {
    date: "2026-07-15",
    startMinute: 14 * 60,
    endMinute: 18 * 60,
  });
  assertEquals(res.completion, "complete");
  const moves = res.output.changes.filter((c) => c.kind === "move");
  assertEquals(moves.length, 1);
  assertEquals(moves[0].appointment_id, "appt-2");
  // the freed slot must not be re-used on the same afternoon
  const back = moves[0].new_date === "2026-07-15" &&
    parseInt(moves[0].new_start_time.slice(0, 2), 10) >= 14;
  assert(!back, "must not land back in the freed afternoon");
});

Deno.test("J: a locked appointment blocks a full free but partials the rest", async () => {
  const input = await load("j_free_period.json");
  input.appointments[0].locked = true; // appt-1 pinned inside the day
  const res = runFreePeriod(input, {
    date: "2026-07-15",
    startMinute: 0,
    endMinute: 24 * 60,
  });
  assertEquals(res.completion, "partial");
  assert(res.blockers.some((b) => b.appointment_id === "appt-1" && b.code === "LOCKED"));
  // the movable one still evacuates
  assert(res.output.changes.some((c) => c.kind === "move" && c.appointment_id === "appt-2"));
});
