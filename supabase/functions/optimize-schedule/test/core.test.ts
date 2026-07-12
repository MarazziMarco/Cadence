// Offline tests for solveCore against fixtures. Run: `deno test`.
// No network, no DB. Asserts hard-constraint validity, idle non-increase,
// move-budget enforcement, and waiting-list fill behavior.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findHardViolation, runSolver } from "../solver/core.ts";
import { capacityWindows } from "../solver/time.ts";
import type { SolverInput } from "../solver/types.ts";

async function load(name: string): Promise<SolverInput> {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(url)) as SolverInput;
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

Deno.test("determinism: same input yields identical output", async () => {
  const input = await load("a_interstitial_gap.json");
  const r1 = runSolver(input);
  const r2 = runSolver(await load("a_interstitial_gap.json"));
  assertEquals(
    JSON.stringify(r1.output.changes),
    JSON.stringify(r2.output.changes),
  );
});
