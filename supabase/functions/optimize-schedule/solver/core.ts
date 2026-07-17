// solveCore: the whole optimization, PURE and deterministic. Zero I/O, zero DB.
// Repair/compaction over the real schedule (not a rebuild), move-budgeted,
// time-boxed local search. Testable offline against fixtures/*.json.
//
// Spec: cadence_solver_data_contract.md §1-§8.

import type {
  ChangeOutput,
  Mode,
  Patient,
  Service,
  Settings,
  SolverInput,
  SolverOutput,
  WaitingListEntry,
} from "./types.ts";
import {
  type AvailWindow,
  capacityWindows,
  dateRange,
  dateTimeMs,
  dayDiff,
  effectiveAvailability,
  toHHMM,
  toHHMMSS,
  weekdayOf,
  type Window,
  windowIndex,
} from "./time.ts";
import { explainCreate, explainMove } from "./explain.ts";

// ---- tuning defaults -----------------------------------------------------
const DEF_MOVE_BASE = 15;
const DEF_PRICE_UNIT = 10;
const DEF_MIN_IDLE_GAP = 5;

const MODE_MULT: Record<Mode, number> = {
  conservative: 2.0,
  balanced: 1.0,
  aggressive: 0.5,
};

// ---- internal state ------------------------------------------------------

/** A scheduled item on the timeline (anchor, movable, or created). */
interface Slot {
  id: string; // appointment id, or synthetic "wl:<id>" for created
  patient_id: string;
  service: Service | null;
  date: string;
  start: number; // service start, minutes
  dur: number; // service duration, minutes (constant across moves)
  price: number;
  bufBefore: number;
  bufAfter: number;
  movable: boolean; // false => anchor (locked / no-AI / dirty)
  created: boolean; // true => came from waiting list
  manual_override: boolean;
  location_key: string;
  // waiting-list bookkeeping (created only)
  wlPriority?: string;
}

interface Origin {
  date: string;
  start: number;
}

const occStart = (s: Slot) => s.start - s.bufBefore;
const occEnd = (s: Slot) => s.start + s.dur + s.bufAfter;

function studioLocationKey(input: SolverInput): string {
  return input.studio_location_key ?? "studio:unknown";
}

function travelMinutes(
  input: SolverInput,
  from: string,
  to: string,
): number | null {
  if (from.startsWith("unresolved:") || to.startsWith("unresolved:")) {
    return null;
  }
  const leg = input.travel_matrix?.[from]?.[to];
  if (leg?.verifiable && Number.isFinite(leg.seconds) && leg.seconds >= 0) {
    return Math.ceil(leg.seconds / 60);
  }
  return from === to && from.startsWith("studio:") ? 0 : null;
}

function routeViolationForDay(
  input: SolverInput,
  slots: Slot[],
  date: string,
): string | null {
  const wins = capacityWindows(date, input.working_hours, input.holidays);
  if (wins.length === 0) return null;
  const ordered = slots
    .filter((slot) => slot.date === date)
    .sort((a, b) => occStart(a) - occStart(b) || a.id.localeCompare(b.id));
  if (ordered.length === 0) return null;

  const studio = studioLocationKey(input);
  const first = ordered[0];
  const firstTravel = travelMinutes(input, studio, first.location_key);
  if (firstTravel === null) {
    return `first travel unavailable ${studio}/${first.location_key} on ${date}`;
  }
  if (wins[0].start + firstTravel > occStart(first)) {
    return `insufficient first travel before ${first.id} on ${date}`;
  }

  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const next = ordered[i];
    const travel = travelMinutes(
      input,
      previous.location_key,
      next.location_key,
    );
    if (travel === null) {
      return `travel unavailable ${previous.id}/${next.id} on ${date}`;
    }
    if (occEnd(previous) + travel > occStart(next)) {
      return `insufficient travel ${previous.id}/${next.id} on ${date}`;
    }
  }

  const last = ordered[ordered.length - 1];
  const lastTravel = travelMinutes(input, last.location_key, studio);
  if (lastTravel === null) {
    return `last travel unavailable ${last.location_key}/${studio} on ${date}`;
  }
  if (occEnd(last) + lastTravel > wins[wins.length - 1].end) {
    return `insufficient last travel after ${last.id} on ${date}`;
  }
  return null;
}

// ---- seeded RNG (mulberry32) --------------------------------------------
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(input: SolverInput): number {
  const s = `${input.context.business_id}|${input.context.date_from}|${input.context.date_to}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---- helpers -------------------------------------------------------------

function tuning(settings: Settings) {
  const m = settings.metadata ?? {};
  return {
    MOVE_BASE: m.MOVE_BASE ?? DEF_MOVE_BASE,
    PRICE_UNIT: m.PRICE_UNIT ?? DEF_PRICE_UNIT,
    MIN_IDLE_GAP: m.MIN_IDLE_GAP ?? DEF_MIN_IDLE_GAP,
    PRIORITIZE_ADVANCE: m.PRIORITIZE_ADVANCE ?? true,
    ADVANCE_MIN_DAYS: m.ADVANCE_MIN_DAYS ?? 3,
  };
}

function mondayKey(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  const mondayIndex = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - mondayIndex);
  return `${value.getUTCFullYear()}-${
    String(value.getUTCMonth() + 1).padStart(2, "0")
  }-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function existingDateAllowed(
  input: SolverInput,
  originDate: string,
  candidateDate: string,
): boolean {
  if (input.context.scope_kind !== "month") return true;
  if (!input.context.allow_cross_week) {
    return mondayKey(candidateDate) === mondayKey(originDate);
  }
  const maxDays = input.context.max_cross_week_days ?? 7;
  return Math.abs(dayDiff(originDate, candidateDate)) <= maxDays;
}

/** Slots that conflict (footprint overlap) on the same date, excluding self. */
function conflicts(slot: Slot, slots: Slot[]): boolean {
  const s0 = occStart(slot), e0 = occEnd(slot);
  for (const o of slots) {
    if (o === slot || o.date !== slot.date) continue;
    if (s0 < occEnd(o) && occStart(o) < e0) return true;
  }
  return false;
}

/** Availability windows for a slot's patient on a date, resolved once. */
function availFor(
  input: SolverInput,
  patientId: string,
  date: string,
): AvailWindow[] | null {
  return effectiveAvailability(
    patientId,
    date,
    input.patient_availability,
    input.patient_exceptions,
  );
}

/** Hard-constraint feasibility of placing `slot` at (date, start). */
function feasibleAt(
  input: SolverInput,
  slots: Slot[],
  slot: Slot,
  date: string,
  start: number,
): boolean {
  const end = start + slot.dur;
  const wins = capacityWindows(date, input.working_hours, input.holidays);
  const wi = windowIndex(start, end, wins);
  if (wi < 0) return false; // outside working hours / lunch / closed

  const av = availFor(input, slot.patient_id, date);
  if (av !== null && !av.some((w) => start >= w.start && end <= w.end)) {
    return false; // outside patient's effective availability
  }

  // temporarily reflect the candidate position for conflict + split-day checks
  const prevDate = slot.date, prevStart = slot.start;
  slot.date = date;
  slot.start = start;
  const ok = !conflicts(slot, slots) &&
    splitDayOk(input, slots, slot, wins, wi) &&
    routeViolationForDay(input, slots, date) === null;
  slot.date = prevDate;
  slot.start = prevStart;
  return ok;
}

/** allow_split_days=false: a patient may not span different capacity windows same day. */
function splitDayOk(
  input: SolverInput,
  slots: Slot[],
  slot: Slot,
  wins: Window[],
  wi: number,
): boolean {
  if (input.context.settings.allow_split_days) return true;
  for (const o of slots) {
    if (o === slot || o.date !== slot.date || o.patient_id !== slot.patient_id) {
      continue;
    }
    const oi = windowIndex(o.start, o.start + o.dur, wins);
    if (oi >= 0 && oi !== wi) return false;
  }
  return true;
}

/** Candidate start positions (ascending) inside `date` for `slot`. */
function candidateStarts(
  input: SolverInput,
  slots: Slot[],
  slot: Slot,
  date: string,
): number[] {
  const wins = capacityWindows(date, input.working_hours, input.holidays);
  const set = new Set<number>();
  const studio = studioLocationKey(input);
  for (const w of wins) {
    set.add(w.start + slot.bufBefore);
    set.add(w.end - slot.dur - slot.bufAfter);
    const firstTravel = travelMinutes(input, studio, slot.location_key);
    if (firstTravel !== null) {
      set.add(w.start + firstTravel + slot.bufBefore);
    }
    const lastTravel = travelMinutes(input, slot.location_key, studio);
    if (lastTravel !== null) {
      set.add(w.end - lastTravel - slot.dur - slot.bufAfter);
    }
    for (const o of slots) {
      if (o === slot || o.date !== date) continue;
      const afterTravel = travelMinutes(
        input,
        o.location_key,
        slot.location_key,
      );
      if (afterTravel !== null) {
        const after = occEnd(o) + afterTravel + slot.bufBefore;
        if (after >= w.start && after + slot.dur <= w.end) set.add(after);
      }
      const beforeTravel = travelMinutes(
        input,
        slot.location_key,
        o.location_key,
      );
      if (beforeTravel !== null) {
        const before = occStart(o) - beforeTravel - slot.dur - slot.bufAfter;
        if (before >= w.start && before + slot.dur <= w.end) set.add(before);
      }
    }
  }
  const av = availFor(input, slot.patient_id, date);
  if (av) for (const w of av) set.add(w.start); // availability boundaries
  return [...set].filter((s) => s >= 0).sort((a, b) => a - b);
}

// ---- metrics: idle + gap count -------------------------------------------

interface IdleMetrics {
  idle: number;
  gapCount: number;
}

/** Minutes of [a, b) that fall INSIDE the open capacity windows (i.e. exclude
 * lunch and any other closure gap between windows). */
function openOverlap(a: number, b: number, wins: Window[]): number {
  let sum = 0;
  for (const w of wins) {
    const lo = Math.max(a, w.start), hi = Math.min(b, w.end);
    if (hi > lo) sum += hi - lo;
  }
  return sum;
}

/**
 * Idle for one day = recoverable empty time BETWEEN the first and last
 * appointment, treating the whole day as one timeline (not per-window in
 * isolation). For each pair of appointments consecutive by start we count the
 * free time between the previous footprint's end and the next footprint's
 * start, minus any closure inside that span (lunch gap between morning and
 * afternoon windows). Consequences of this definition:
 *  - a gap straddling the lunch break IS counted, net of the lunch itself;
 *  - empty time before the first / after the last appointment is NOT counted
 *    (compaction can't remove it);
 *  - buffers stay productive (we measure occEnd..occStart, so buffer time is
 *    never idle);
 *  - MIN_IDLE_GAP still filters out tiny sub-threshold gaps.
 */
function dayIdleAndGaps(
  input: SolverInput,
  slots: Slot[],
  date: string,
  minGap: number,
): IdleMetrics {
  const wins = capacityWindows(date, input.working_hours, input.holidays);
  if (wins.length === 0) return { idle: 0, gapCount: 0 };
  const inDay = slots
    .filter((s) =>
      s.date === date && windowIndex(s.start, s.start + s.dur, wins) >= 0
    )
    .sort((a, b) => a.start - b.start);
  let idle = 0, gapCount = 0;
  for (let i = 1; i < inDay.length; i++) {
    const from = occEnd(inDay[i - 1]);
    const to = occStart(inDay[i]);
    if (to <= from) continue; // touching or (guarded elsewhere) overlapping
    const open = openOverlap(from, to, wins);
    const travel = travelMinutes(
      input,
      inDay[i - 1].location_key,
      inDay[i].location_key,
    );
    if (travel === null) continue;
    const closed = Math.max(0, to - from - open);
    const travelDuringOpen = Math.max(0, travel - closed);
    const net = Math.max(0, open - travelDuringOpen);
    if (net >= minGap) {
      idle += net;
      gapCount++;
    }
  }
  return { idle, gapCount };
}

function idleAndGaps(
  input: SolverInput,
  slots: Slot[],
  minGap: number,
): IdleMetrics {
  let idle = 0, gapCount = 0;
  for (const date of dateRange(input.context.date_from, input.context.date_to)) {
    const m = dayIdleAndGaps(input, slots, date, minGap);
    idle += m.idle;
    gapCount += m.gapCount;
  }
  return { idle, gapCount };
}

// ---- objective C(S) ------------------------------------------------------

interface CostBreakdown {
  C: number;
  idle: number;
  gapCount: number;
  moved: number;
  vipMoved: number;
  placed: number;
  createdRev: number;
}

function totalCost(
  input: SolverInput,
  slots: Slot[],
  origin: Map<string, Origin>,
  patientMap: Map<string, Patient>,
  baselineGapCount: number,
  K: { MOVE_BASE: number; PRICE_UNIT: number; MIN_IDLE_GAP: number },
): CostBreakdown {
  const S = input.context.settings;
  const mult = MODE_MULT[input.context.mode];
  const im = idleAndGaps(input, slots, K.MIN_IDLE_GAP);

  let movePen = 0, moved = 0, vipMoved = 0, placed = 0, createdRev = 0;
  for (const s of slots) {
    if (s.created) {
      placed++;
      createdRev += s.price;
      continue;
    }
    const o = origin.get(s.id);
    if (o && (o.date !== s.date || o.start !== s.start)) {
      moved++;
      const vip = patientMap.get(s.patient_id)?.is_vip ?? false;
      let mc = K.MOVE_BASE;
      if (s.manual_override) mc += S.weight_manual_lock;
      if (vip) {
        mc += S.weight_vip;
        vipMoved++;
      }
      movePen += mc;
    }
  }

  const pref = prefViolations(input, slots);
  const cont = continuityBreaks(slots, origin);
  const gapCons = Math.max(0, baselineGapCount - im.gapCount);

  const C = S.weight_idle_time * im.idle +
    mult * movePen +
    S.weight_patient_preference * pref +
    S.weight_continuity * cont -
    S.weight_waiting_list * placed -
    S.weight_revenue * (createdRev / K.PRICE_UNIT) -
    S.weight_free_slots * gapCons;

  return {
    C,
    idle: im.idle,
    gapCount: im.gapCount,
    moved,
    vipMoved,
    placed,
    createdRev,
  };
}

/** Scheduled inside availability but outside any 'high' window, when one existed. */
function prefViolations(input: SolverInput, slots: Slot[]): number {
  let n = 0;
  for (const s of slots) {
    const av = availFor(input, s.patient_id, s.date);
    if (!av) continue;
    const highs = av.filter((w) => w.priority === "high");
    if (highs.length === 0) continue;
    const end = s.start + s.dur;
    const inHigh = highs.some((w) => s.start >= w.start && end <= w.end);
    if (!inHigh) n++;
  }
  return n;
}

/** Patients with >=2 appts whose weekday/time pattern is broken by a move (>60min or weekday change). */
function continuityBreaks(
  slots: Slot[],
  origin: Map<string, Origin>,
): number {
  const counts = new Map<string, number>();
  for (const s of slots) {
    if (s.created) continue;
    counts.set(s.patient_id, (counts.get(s.patient_id) ?? 0) + 1);
  }
  let breaks = 0;
  for (const s of slots) {
    if (s.created || (counts.get(s.patient_id) ?? 0) < 2) continue;
    const o = origin.get(s.id);
    if (!o) continue;
    const weekdayChanged = weekdayOf(o.date) !== weekdayOf(s.date);
    const shifted = Math.abs(o.start - s.start) > 60;
    if (weekdayChanged || shifted) breaks++;
  }
  return breaks;
}

// ---- move budgets --------------------------------------------------------

function budgetsOk(
  input: SolverInput,
  slots: Slot[],
  origin: Map<string, Origin>,
): boolean {
  const S = input.context.settings;
  const perPatient = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const s of slots) {
    if (s.created) continue;
    const o = origin.get(s.id);
    if (o && (o.date !== s.date || o.start !== s.start)) {
      perPatient.set(s.patient_id, (perPatient.get(s.patient_id) ?? 0) + 1);
      perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1);
    }
  }
  for (const v of perPatient.values()) if (v > S.max_patient_moves) return false;
  for (const v of perDay.values()) if (v > S.max_daily_moves) return false;
  return true;
}

// ---- world build ---------------------------------------------------------

function buildSlots(input: SolverInput): { slots: Slot[]; dirty: Slot[] } {
  const svcById = new Map(input.services.map((s) => [s.id, s]));
  const slots: Slot[] = [];
  const dirty: Slot[] = [];
  for (const a of input.appointments) {
    const svc = a.service_id ? svcById.get(a.service_id) ?? null : null;
    const dur = a.duration_minutes ??
      (svc ? svc.duration_minutes : 0);
    const noAi = svc ? svc.allow_ai_scheduling === false : false;
    const slot: Slot = {
      id: a.id,
      patient_id: a.patient_id,
      service: svc,
      date: a.appointment_date,
      start: toMinLocal(a.start_time),
      dur,
      price: a.price ?? (svc ? svc.price : 0),
      bufBefore: svc ? svc.buffer_before_minutes : 0,
      bufAfter: svc ? svc.buffer_after_minutes : 0,
      movable: !a.locked && !noAi,
      created: false,
      manual_override: a.manual_override,
      location_key: a.location_key ?? studioLocationKey(input),
    };
    // dirty data: existing appt outside working hours -> anchor, flag it
    const wins = capacityWindows(
      slot.date,
      input.working_hours,
      input.holidays,
    );
    if (windowIndex(slot.start, slot.start + slot.dur, wins) < 0) {
      slot.movable = false;
      dirty.push(slot);
    }
    slots.push(slot);
  }
  return { slots, dirty };
}

function toMinLocal(t: string): number {
  const p = t.split(":");
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

// ---- waiting-list matching ----------------------------------------------

function wlServiceAndDur(
  input: SolverInput,
  wl: WaitingListEntry,
): { service: Service | null; dur: number; price: number } {
  const svc = wl.preferred_service_id
    ? input.services.find((s) => s.id === wl.preferred_service_id) ?? null
    : null;
  const dur = wl.preferred_duration_minutes ??
    (svc ? svc.duration_minutes : 45);
  const price = svc ? svc.price : 0;
  return { service: svc, dur, price };
}

function serviceConstraintsOk(
  input: SolverInput,
  service: Service | null,
  slots: Slot[],
  date: string,
  start: number,
): boolean {
  if (!service) return true;
  const nowMs = Date.parse(input.context.now);
  // minimum_notice_hours
  if (service.minimum_notice_hours > 0) {
    const apptMs = dateTimeMs(date, start);
    if (apptMs - nowMs < service.minimum_notice_hours * 3600000) return false;
  }
  // maximum_days_in_advance (relative to now's date)
  if (service.maximum_days_in_advance != null) {
    const nowDate = new Date(nowMs).toISOString().slice(0, 10);
    if (dayDiff(nowDate, date) > service.maximum_days_in_advance) return false;
  }
  // max_daily_bookings for this service on this date
  if (service.max_daily_bookings != null) {
    const count = slots.filter(
      (s) => s.date === date && s.service?.id === service.id,
    ).length;
    if (count >= service.max_daily_bookings) return false;
  }
  return true;
}

function wlDateAllowed(wl: WaitingListEntry, date: string): boolean {
  if (date < wl.earliest_date || date > wl.latest_date) return false;
  const wd = weekdayOf(date);
  if (!wl.flexible && wl.preferred_weekdays && wl.preferred_weekdays.length > 0) {
    if (!wl.preferred_weekdays.includes(wd)) return false;
  }
  return true;
}

// ---- diff & output -------------------------------------------------------

function buildOutput(
  input: SolverInput,
  slots: Slot[],
  origin: Map<string, Origin>,
  patientMap: Map<string, Patient>,
  idleBefore: number,
  revenueBefore: number,
  finalCost: CostBreakdown,
  execMs: number,
): SolverOutput {
  const changes: ChangeOutput[] = [];
  let moved = 0, created = 0, vipMoved = 0;

  for (const s of slots) {
    if (s.created) {
      created++;
      changes.push({
        kind: "create",
        appointment_id: null,
        patient_id: s.patient_id,
        old_date: null,
        old_start_time: null,
        old_end_time: null,
        new_date: s.date,
        new_start_time: toHHMMSS(toHHMM(s.start)),
        new_end_time: toHHMMSS(toHHMM(s.start + s.dur)),
        was_moved: true,
        ai_reason: explainCreate(s.wlPriority ?? "normal"),
      });
      continue;
    }
    const o = origin.get(s.id);
    if (o && (o.date !== s.date || o.start !== s.start)) {
      moved++;
      if (patientMap.get(s.patient_id)?.is_vip) vipMoved++;
      const prev = prevOccEndSameWindow(input, slots, s);
      changes.push({
        kind: "move",
        appointment_id: s.id,
        patient_id: s.patient_id,
        old_date: o.date,
        old_start_time: toHHMMSS(toHHMM(o.start)),
        old_end_time: toHHMMSS(toHHMM(o.start + s.dur)),
        new_date: s.date,
        new_start_time: toHHMMSS(toHHMM(s.start)),
        new_end_time: toHHMMSS(toHHMM(s.start + s.dur)),
        was_moved: true,
        ai_reason: explainMove(o.start, s.start, prev, s.start),
      });
    }
  }

  const total = input.appointments.length;
  const unchanged = total - moved;
  const idleAfter = finalCost.idle;
  const revenueAfter = revenueBefore + finalCost.createdRev;

  const ai_summary = buildSummary(
    idleBefore - idleAfter,
    finalCost.createdRev,
    created,
    moved,
    vipMoved,
    changes.length === 0,
  );

  return {
    run: {
      mode: input.context.mode,
      result: "preview",
      objective_score: round2(finalCost.C),
      idle_minutes_before: idleBefore,
      idle_minutes_after: idleAfter,
      moved_appointments: moved,
      unchanged_appointments: unchanged,
      created_appointments: created,
      cancelled_appointments: 0,
      total_appointments: total,
      estimated_revenue_before: round2(revenueBefore),
      estimated_revenue_after: round2(revenueAfter),
      ai_summary,
      execution_time_ms: execMs,
    },
    changes,
  };
}

/** occ_end of the appointment immediately before `s` in its capacity window. */
function prevOccEndSameWindow(
  input: SolverInput,
  slots: Slot[],
  s: Slot,
): number | null {
  const wins = capacityWindows(s.date, input.working_hours, input.holidays);
  const wi = windowIndex(s.start, s.start + s.dur, wins);
  if (wi < 0) return null;
  const w = wins[wi];
  let prevEnd: number | null = null;
  for (const o of slots) {
    if (o === s || o.date !== s.date) continue;
    if (o.start < w.start || o.start + o.dur > w.end) continue;
    if (o.start + o.dur <= s.start) {
      const e = o.start + o.dur + o.bufAfter;
      if (prevEnd == null || e > prevEnd) prevEnd = e;
    }
  }
  return prevEnd;
}

function buildSummary(
  idleRecovered: number,
  createdRev: number,
  created: number,
  moved: number,
  vipMoved: number,
  noChanges: boolean,
): string {
  if (noChanges) return "Agenda già ottimale nel range selezionato.";
  const parts: string[] = [];
  if (idleRecovered > 0) parts.push(`Recuperati ${idleRecovered} min di tempo morto`);
  if (created > 0) {
    parts.push(
      `+${round2(createdRev)}€ inserendo ${created} ${
        created === 1 ? "paziente" : "pazienti"
      } dalla lista d'attesa`,
    );
  }
  let s = parts.join(", ");
  if (s.length > 0) s += ". ";
  const movedTxt = moved === 1
    ? "Spostato 1 appuntamento"
    : `Spostati ${moved} appuntamenti`;
  s += `${movedTxt}, ${vipMoved} VIP toccati.`;
  return s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---- validation (used by tests) ------------------------------------------

/** Returns a hard-constraint violation message, or null if the schedule is valid. */
export function findHardViolation(
  input: SolverInput,
  slots: Slot[],
): string | null {
  for (const date of dateRange(input.context.date_from, input.context.date_to)) {
    const dayslots = slots.filter((s) => s.date === date);
    const wins = capacityWindows(date, input.working_hours, input.holidays);
    for (const s of dayslots) {
      const end = s.start + s.dur;
      if (windowIndex(s.start, end, wins) < 0 && s.movable !== false) {
        return `slot ${s.id} outside working hours on ${date}`;
      }
      const av = availFor(input, s.patient_id, date);
      if (
        av !== null && !av.some((w) => s.start >= w.start && end <= w.end) &&
        s.movable !== false
      ) {
        return `slot ${s.id} outside patient availability on ${date}`;
      }
    }
    // overlaps
    for (let i = 0; i < dayslots.length; i++) {
      for (let j = i + 1; j < dayslots.length; j++) {
        const a = dayslots[i], b = dayslots[j];
        if (occStart(a) < occEnd(b) && occStart(b) < occEnd(a)) {
          return `overlap ${a.id}/${b.id} on ${date}`;
        }
      }
    }
    const routeViolation = routeViolationForDay(input, dayslots, date);
    if (routeViolation) return routeViolation;
  }
  return null;
}

// ---- rich result for tests ----------------------------------------------

export interface SolverResult {
  output: SolverOutput;
  slots: Slot[]; // final schedule (anchors + moved + created)
  idleBefore: number;
  idleAfter: number;
}

/** Full solve returning internals; solveCore() wraps this for the DB layer. */
export function runSolver(input: SolverInput): SolverResult {
  const t0 = Date.now();
  const K = tuning(input.context.settings);
  const S = input.context.settings;
  const patientMap = new Map<string, Patient>(
    input.patients.map((p) => [p.id, p]),
  );

  // Phase 0 — build
  const { slots } = buildSlots(input);
  const origin = new Map<string, Origin>();
  for (const s of slots) origin.set(s.id, { date: s.date, start: s.start });

  // Phase 1 — baseline
  const baseIdle = idleAndGaps(input, slots, K.MIN_IDLE_GAP);
  const baselineIdle = baseIdle.idle;
  const baselineGapCount = baseIdle.gapCount;
  const revenueBefore = slots.reduce((sum, s) => sum + s.price, 0);

  const cost = () =>
    totalCost(input, slots, origin, patientMap, baselineGapCount, K);
  let cur = cost();

  // never accept a state that violates hard constraints, budgets, or that
  // pushes total idle above the baseline (keeps idle monotone non-increasing).
  const accept = (candidate: CostBreakdown): boolean =>
    candidate.C < cur.C - 1e-9 &&
    candidate.idle <= baselineIdle &&
    findHardViolation(input, slots) === null &&
    budgetsOk(input, slots, origin);

  // Phase 1.5 — advance pre-pass. Clients who asked to be moved up take a freed
  // earlier slot FIRST (before general compaction), so we don't shuffle everyone
  // else to fill it. A strong, opt-out priority (default on). Cross-day: the far
  // appointment is pulled into the earliest feasible slot that is >= ADVANCE_MIN_DAYS
  // earlier and still valid (hard constraints & the client's availability apply).
  if (K.PRIORITIZE_ADVANCE !== false) {
    const minDays = K.ADVANCE_MIN_DAYS ?? 3;
    const advDates = dateRange(input.context.date_from, input.context.date_to);
    // Advancing is a business priority, not a cost win — accept the move as long
    // as it's valid, within budgets, and doesn't raise total idle (unlike the
    // normal accept, we don't require the objective to strictly improve).
    const acceptAdvance = (candidate: CostBreakdown): boolean =>
      candidate.idle <= baselineIdle &&
      findHardViolation(input, slots) === null &&
      budgetsOk(input, slots, origin);
    for (const w of input.waiting_list) {
      if (!w.advance_for) continue;
      const s = slots.find((x) => x.id === w.advance_for && x.movable);
      if (!s) continue;
      const curDate = s.date;
      let placed = false;
      for (const date of advDates) {
        if (date >= curDate) break;
        if (dayDiff(date, curDate) < minDays) continue;
        if (!existingDateAllowed(input, curDate, date)) continue;
        for (const cand of candidateStarts(input, slots, s, date)) {
          const prevDate = s.date, prevStart = s.start;
          s.date = date;
          s.start = cand;
          const c2 = cost();
          if (acceptAdvance(c2)) { cur = c2; placed = true; break; }
          s.date = prevDate;
          s.start = prevStart;
        }
        if (placed) break;
      }
    }
  }

  // Phase 2 — compaction (fill_gaps_first): pull movable slots earlier
  if (S.fill_gaps_first && S.preserve_existing_schedule) {
    const days = dateRange(input.context.date_from, input.context.date_to);
    days.sort((a, b) => dayIdle(input, slots, b, K.MIN_IDLE_GAP) - dayIdle(input, slots, a, K.MIN_IDLE_GAP));
    for (const date of days) {
      const movers = slots
        .filter((s) => s.movable && s.date === date)
        .sort((a, b) => a.start - b.start);
      for (const s of movers) {
        for (const cand of candidateStarts(input, slots, s, date)) {
          if (cand >= s.start) break; // only pull earlier
          if (!feasibleAt(input, slots, s, date, cand)) continue;
          const prevStart = s.start;
          s.start = cand;
          const c2 = cost();
          if (accept(c2)) {
            cur = c2;
            break;
          }
          s.start = prevStart;
        }
      }
    }
  }

  // Contextual month runs may consider cross-day moves. Isolated month runs
  // stay inside the appointment's Monday-Sunday bucket; explicitly enabled
  // runs may move no farther than max_cross_week_days.
  if (input.context.scope_kind === "month") {
    const days = dateRange(input.context.date_from, input.context.date_to);
    for (const s of slots.filter((slot) => slot.movable)) {
      const original = origin.get(s.id);
      if (!original) continue;
      let placed = false;
      for (const date of days) {
        if (date === s.date) continue;
        if (!existingDateAllowed(input, original.date, date)) continue;
        for (const cand of candidateStarts(input, slots, s, date)) {
          const previousDate = s.date;
          const previousStart = s.start;
          s.date = date;
          s.start = cand;
          const candidate = cost();
          if (accept(candidate)) {
            cur = candidate;
            placed = true;
            break;
          }
          s.date = previousDate;
          s.start = previousStart;
        }
        if (placed) break;
      }
    }
  }

  // Phase 3 — waiting-list fill
  if (S.allow_waiting_list) {
    const wl = [...input.waiting_list].sort((a, b) =>
      prio(b.priority) - prio(a.priority)
    );
    const days = dateRange(input.context.date_from, input.context.date_to);
    for (const entry of wl) {
      if (entry.advance_for) continue; // advance entries move an existing appt (pre-pass), never create
      const { service, dur, price } = wlServiceAndDur(input, entry);
      let placed = false;
      for (const date of days) {
        if (placed) break;
        if (!wlDateAllowed(entry, date)) continue;
        const probe: Slot = {
          id: `wl:${entry.id}`,
          patient_id: entry.patient_id,
          service,
          date,
          start: 0,
          dur,
          price,
          bufBefore: service ? service.buffer_before_minutes : 0,
          bufAfter: service ? service.buffer_after_minutes : 0,
          movable: false,
          created: true,
          manual_override: false,
          location_key: studioLocationKey(input),
          wlPriority: entry.priority,
        };
        for (const cand of candidateStarts(input, slots, probe, date)) {
          if (!wlTimeOk(entry, cand, dur)) continue;
          if (!feasibleAt(input, slots, probe, date, cand)) continue;
          if (!serviceConstraintsOk(input, service, slots, date, cand)) continue;
          probe.start = cand;
          slots.push(probe);
          const c2 = cost();
          // creating is a reward; accept if it improves cost and stays valid
          if (
            c2.C < cur.C - 1e-9 && findHardViolation(input, slots) === null &&
            budgetsOk(input, slots, origin)
          ) {
            cur = c2;
            placed = true;
            break;
          }
          slots.pop();
        }
      }
    }
  }

  // Phase 4 — local search (hill-climbing with light restart), time-boxed
  const rng = makeRng(seedFrom(input));
  const movers = slots.filter((s) => s.movable);
  if (movers.length > 0) {
    const deadline = t0 + Math.min(S.max_solver_seconds, 30) * 1000;
    const maxIter = 3000;
    for (let it = 0; it < maxIter && Date.now() < deadline; it++) {
      const s = movers[Math.floor(rng() * movers.length)];
      const cands = candidateStarts(input, slots, s, s.date);
      if (cands.length === 0) continue;
      const cand = cands[Math.floor(rng() * cands.length)];
      if (cand === s.start) continue;
      if (!feasibleAt(input, slots, s, s.date, cand)) continue;
      const prevStart = s.start;
      s.start = cand;
      const c2 = cost();
      if (accept(c2)) {
        cur = c2;
      } else {
        s.start = prevStart;
      }
    }
  }

  const finalCost = cost();
  const execMs = Date.now() - t0;
  const output = buildOutput(
    input,
    slots,
    origin,
    patientMap,
    baselineIdle,
    revenueBefore,
    finalCost,
    execMs,
  );
  return { output, slots, idleBefore: baselineIdle, idleAfter: finalCost.idle };
}

function dayIdle(
  input: SolverInput,
  slots: Slot[],
  date: string,
  minGap: number,
): number {
  return dayIdleAndGaps(input, slots, date, minGap).idle;
}

function prio(p: string): number {
  return p === "high" ? 3 : p === "normal" ? 2 : 1;
}

function wlTimeOk(wl: WaitingListEntry, start: number, dur: number): boolean {
  if (wl.earliest_time && start < toMinLocal(wl.earliest_time)) return false;
  if (wl.latest_time && start + dur > toMinLocal(wl.latest_time)) return false;
  return true;
}

/** Public entrypoint used by the DB layer. Pure. */
export function solveCore(input: SolverInput): SolverOutput {
  return runSolver(input).output;
}

// ---- free a day / afternoon (evacuation search) --------------------------

export interface ExcludedPeriod {
  date: string;
  startMinute: number;
  endMinute: number;
}
export type FreePeriodCompletion = "complete" | "partial" | "impossible";
export interface FreePeriodBlocker {
  appointment_id: string;
  patient_id: string;
  code: string; // LOCKED | UNAVAILABLE | ROUTE | NO_SLOT
}
export interface FreePeriodResult {
  output: SolverOutput;
  completion: FreePeriodCompletion;
  blockers: FreePeriodBlocker[];
}

function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const end = Date.UTC(ty, tm - 1, td);
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end; t += 86400000) {
    const d = new Date(t);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${
        String(d.getUTCDate()).padStart(2, "0")
      }`,
    );
  }
  return out;
}

const overlapsPeriod = (
  date: string,
  occS: number,
  occE: number,
  ex: ExcludedPeriod,
): boolean =>
  date === ex.date && occS < ex.endMinute && ex.startMinute < occE;

/**
 * Free an entire period (a day, or an afternoon) by relocating every appointment
 * that overlaps it to another feasible slot in the same week — without ever
 * placing anything back inside the period. Most-constrained appointments move
 * first; anything that cannot move is reported as a blocker.
 */
export function runFreePeriod(
  input: SolverInput,
  ex: ExcludedPeriod,
): FreePeriodResult {
  const t0 = Date.now();
  const K = tuning(input.context.settings);
  const patientMap = new Map<string, Patient>(
    input.patients.map((p) => [p.id, p]),
  );
  const { slots } = buildSlots(input);
  const origin = new Map<string, Origin>();
  for (const s of slots) origin.set(s.id, { date: s.date, start: s.start });

  const base = idleAndGaps(input, slots, K.MIN_IDLE_GAP);
  const idleBefore = base.idle;
  const revenueBefore = slots.reduce((sum, s) => sum + s.price, 0);
  const dates = datesInRange(input.context.date_from, input.context.date_to);

  // Placement that also refuses to land back inside the excluded period.
  const feasibleOut = (slot: Slot, date: string, start: number): boolean => {
    const occS = start - slot.bufBefore;
    const occE = start + slot.dur + slot.bufAfter;
    if (overlapsPeriod(date, occS, occE, ex)) return false;
    return feasibleAt(input, slots, slot, date, start);
  };
  const placementsFor = (slot: Slot): { date: string; start: number }[] => {
    const out: { date: string; start: number }[] = [];
    for (const d of dates) {
      for (const c of candidateStarts(input, slots, slot, d)) {
        if (feasibleOut(slot, d, c)) out.push({ date: d, start: c });
      }
    }
    return out;
  };

  const targets = slots.filter((s) =>
    !s.created && overlapsPeriod(s.date, occStart(s), occEnd(s), ex)
  );
  const blockers: FreePeriodBlocker[] = [];

  // Locked appointments in the period can never move: hard blockers.
  for (const l of targets.filter((s) => !s.movable)) {
    blockers.push({
      appointment_id: l.id,
      patient_id: l.patient_id,
      code: "LOCKED",
    });
  }

  // Most-constrained-first: evacuate the appointments with the fewest options.
  const movable = targets.filter((s) => s.movable)
    .map((s) => ({ s, count: placementsFor(s).length }))
    .sort((a, b) => a.count - b.count || a.s.id.localeCompare(b.s.id));

  let movedCount = 0;
  for (const { s } of movable) {
    const opts = placementsFor(s).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start
    );
    if (opts.length === 0) {
      blockers.push({
        appointment_id: s.id,
        patient_id: s.patient_id,
        code: blockerCode(input, slots, s, dates, ex),
      });
      continue;
    }
    s.date = opts[0].date;
    s.start = opts[0].start;
    movedCount++;
  }

  const completion: FreePeriodCompletion = blockers.length === 0
    ? "complete"
    : movedCount > 0
    ? "partial"
    : "impossible";

  const baselineGapCount = base.gapCount;
  const finalCost = totalCost(
    input,
    slots,
    origin,
    patientMap,
    baselineGapCount,
    K,
  );
  const output = buildOutput(
    input,
    slots,
    origin,
    patientMap,
    idleBefore,
    revenueBefore,
    finalCost,
    Date.now() - t0,
  );
  return { output, completion, blockers };
}

// Why couldn't this appointment leave the period? Prefer the most specific
// cause: a client availability that blocks every slot, then a route violation,
// otherwise simply no open slot.
function blockerCode(
  input: SolverInput,
  slots: Slot[],
  slot: Slot,
  dates: string[],
  ex: ExcludedPeriod,
): string {
  let sawWindow = false;
  let sawAvail = false;
  for (const d of dates) {
    for (const c of candidateStarts(input, slots, slot, d)) {
      const occS = c - slot.bufBefore, occE = c + slot.dur + slot.bufAfter;
      if (overlapsPeriod(d, occS, occE, ex)) continue;
      sawWindow = true;
      const av = availFor(input, slot.patient_id, d);
      const availOk = av === null || av.some((w) => c >= w.start && c + slot.dur <= w.end);
      if (availOk) {
        sawAvail = true;
        // window + availability fine but still infeasible => conflict/route/split
        const prevDate = slot.date, prevStart = slot.start;
        slot.date = d; slot.start = c;
        const route = routeViolationForDay(input, slots, d) !== null;
        slot.date = prevDate; slot.start = prevStart;
        if (route) return "ROUTE";
      }
    }
  }
  if (sawWindow && !sawAvail) return "UNAVAILABLE";
  return "NO_SLOT";
}
