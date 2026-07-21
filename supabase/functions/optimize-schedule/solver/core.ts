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
const DEF_MOVE_BASE = 0; // spec §2: w_moves default 0 — moves are free by default
const DEF_PRICE_UNIT = 10;
const DEF_MIN_IDLE_GAP = 5;
const DEF_W_TRAVEL = 1.0; // spec §2: 1 min driving = 1 min idle
const DEF_R_POOL = 240; // spec §7: reward per pool sitting inserted (~4h equivalent)
// Last-resort per-leg estimate (minutes) when neither an ORS leg nor
// coordinates exist — keeps a day feasible instead of freezing it (spec §3).
const DEF_UNKNOWN_TRAVEL = 15;

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
  wlEntryId?: string; // pool plan entry id, for the created->pool link (spec §7)
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

function startLocationKey(input: SolverInput): string {
  return input.start_location_key ?? studioLocationKey(input);
}

function endLocationKey(input: SolverInput): string {
  return input.end_location_key ?? studioLocationKey(input);
}

function coordOf(
  input: SolverInput,
  key: string,
): { lat: number; lng: number } | null {
  const c = input.location_coords?.[key];
  if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
    return { lat: c.latitude, lng: c.longitude };
  }
  return null;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Travel time (minutes) between two location keys. NEVER null (spec §3
 * fallback): a missing/unverifiable ORS leg is estimated from the haversine
 * distance (×1.3 detour factor / 30 km/h), and when even coordinates are
 * missing we fall back to a small constant so a day is never frozen.
 *   - `t = 0` when both ends are the same key (two studio appts, spec §1).
 *   - `estimated: true` marks any value not backed by a verifiable ORS leg.
 */
function travelLeg(
  input: SolverInput,
  from: string,
  to: string,
): { minutes: number; estimated: boolean } {
  if (from === to) return { minutes: 0, estimated: false };
  const leg = input.travel_matrix?.[from]?.[to];
  if (leg?.verifiable && Number.isFinite(leg.seconds) && leg.seconds >= 0) {
    return { minutes: Math.ceil(leg.seconds / 60), estimated: false };
  }
  const a = coordOf(input, from);
  const b = coordOf(input, to);
  if (a && b) {
    const km = haversineKm(a, b);
    return {
      minutes: Math.max(1, Math.round((km * 1.3) / 30 * 60)),
      estimated: true,
    };
  }
  return { minutes: DEF_UNKNOWN_TRAVEL, estimated: true };
}

function travelMinutes(input: SolverInput, from: string, to: string): number {
  return travelLeg(input, from, to).minutes;
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

  // Edge legs (studio -> first, last -> studio) are cost-only, NOT hard
  // constraints (spec §3.6): the day never has to "wait" for the drive from
  // home. Only transitions between consecutive same-day appointments must be
  // physically feasible. Travel is never null (haversine fallback), so a
  // missing ORS leg never freezes a day.
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const next = ordered[i];
    const travel = travelMinutes(
      input,
      previous.location_key,
      next.location_key,
    );
    if (occEnd(previous) + travel > occStart(next)) {
      return `insufficient travel ${previous.id}/${next.id} on ${date}`;
    }
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
    W_TRAVEL: m.W_TRAVEL ?? DEF_W_TRAVEL,
    R_POOL: m.R_POOL ?? DEF_R_POOL,
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
  const startLoc = startLocationKey(input);
  const endLoc = endLocationKey(input);
  for (const w of wins) {
    set.add(w.start + slot.bufBefore);
    set.add(w.end - slot.dur - slot.bufAfter);
    const firstTravel = travelMinutes(input, startLoc, slot.location_key);
    set.add(w.start + firstTravel + slot.bufBefore);
    const lastTravel = travelMinutes(input, slot.location_key, endLoc);
    set.add(w.end - lastTravel - slot.dur - slot.bufAfter);
    for (const o of slots) {
      if (o === slot || o.date !== date) continue;
      const afterTravel = travelMinutes(input, o.location_key, slot.location_key);
      const after = occEnd(o) + afterTravel + slot.bufBefore;
      if (after >= w.start && after + slot.dur <= w.end) set.add(after);
      const beforeTravel = travelMinutes(input, slot.location_key, o.location_key);
      const before = occStart(o) - beforeTravel - slot.dur - slot.bufAfter;
      if (before >= w.start && before + slot.dur <= w.end) set.add(before);
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

// ---- travel term (spec §1: Travel(d) = L_start->σ1 + Σ t_ij + σn->L_end) ---

function dayTravel(input: SolverInput, slots: Slot[], date: string): number {
  const wins = capacityWindows(date, input.working_hours, input.holidays);
  if (wins.length === 0) return 0;
  const inDay = slots
    .filter((s) =>
      s.date === date && windowIndex(s.start, s.start + s.dur, wins) >= 0
    )
    .sort((a, b) => occStart(a) - occStart(b) || a.id.localeCompare(b.id));
  if (inDay.length === 0) return 0;
  let t = travelMinutes(input, startLocationKey(input), inDay[0].location_key);
  for (let i = 1; i < inDay.length; i++) {
    t += travelMinutes(input, inDay[i - 1].location_key, inDay[i].location_key);
  }
  t += travelMinutes(
    input,
    inDay[inDay.length - 1].location_key,
    endLocationKey(input),
  );
  return t;
}

function totalTravel(input: SolverInput, slots: Slot[]): number {
  let t = 0;
  for (const date of dateRange(input.context.date_from, input.context.date_to)) {
    t += dayTravel(input, slots, date);
  }
  return t;
}

// ---- objective C(S) ------------------------------------------------------

interface CostBreakdown {
  C: number;
  idle: number;
  travel: number;
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
  K: {
    MOVE_BASE: number;
    PRICE_UNIT: number;
    MIN_IDLE_GAP: number;
    W_TRAVEL: number;
    R_POOL: number;
  },
): CostBreakdown {
  const S = input.context.settings;
  const mult = MODE_MULT[input.context.mode];
  const im = idleAndGaps(input, slots, K.MIN_IDLE_GAP);
  const travel = totalTravel(input, slots);

  let movePen = 0, moved = 0, vipMoved = 0, placed = 0, poolPlaced = 0, createdRev = 0;
  for (const s of slots) {
    if (s.created) {
      placed++;
      if (s.wlEntryId) poolPlaced++; // pool sitting: rewarded by R_POOL (spec §7)
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
    K.W_TRAVEL * travel +
    mult * movePen +
    S.weight_patient_preference * pref +
    S.weight_continuity * cont -
    S.weight_waiting_list * (placed - poolPlaced) -
    K.R_POOL * poolPlaced -
    S.weight_revenue * (createdRev / K.PRICE_UNIT) -
    S.weight_free_slots * gapCons;

  return {
    C,
    idle: im.idle,
    travel,
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
  // 0 = unlimited (spec §2/§54: move budgets are unlimited by default, still
  // configurable). A positive limit is enforced.
  const pMax = S.max_patient_moves, dMax = S.max_daily_moves;
  for (const v of perPatient.values()) if (pMax > 0 && v > pMax) return false;
  for (const v of perDay.values()) if (dMax > 0 && v > dMax) return false;
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
        waiting_list_id: s.wlEntryId ?? null,
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

// ---- exact per-day refinement (spec §6: Held-Karp over subsets) ----------

const EXACT_DAY_MAX = 13; // days larger than this keep the local search only

// Earliest feasible start for `slot` on `date` with occStart ≥ minOccStart. Body
// [start, start+dur] must sit in one window and within availability; buffers may
// extend into closures (matches feasibleAt). Locked slots keep their fixed start.
function earliestStart(
  slot: Slot,
  minOccStart: number,
  wins: Window[],
  av: AvailWindow[] | null,
): number | null {
  if (!slot.movable) {
    return slot.start - slot.bufBefore >= minOccStart ? slot.start : null;
  }
  let best: number | null = null;
  const windows = av && av.length ? av : [null];
  for (const w of wins) {
    for (const a of windows) {
      let start = Math.max(w.start, minOccStart + slot.bufBefore);
      if (a) start = Math.max(start, a.start);
      if (start < w.start || start + slot.dur > w.end) continue;
      if (a && start + slot.dur > a.end) continue;
      if (best === null || start < best) best = start;
    }
  }
  return best;
}

/**
 * Left-justify (forward) + backward gap-close a fixed order of a day's slots
 * (spec §4). Returns the new start per slot in `order` (locked slots keep their
 * fixed start), or null if the order is infeasible.
 */
function retimeOrder(
  input: SolverInput,
  date: string,
  order: Slot[],
): number[] | null {
  const wins = capacityWindows(date, input.working_hours, input.holidays);
  if (wins.length === 0) return null;
  const n = order.length;
  const av = order.map((s) => availFor(input, s.patient_id, date));
  const starts = new Array<number>(n).fill(0);
  let prevOccEnd = -1_000_000;
  for (let i = 0; i < n; i++) {
    const travel = i === 0
      ? 0
      : travelMinutes(input, order[i - 1].location_key, order[i].location_key);
    const st = earliestStart(order[i], prevOccEnd + travel, wins, av[i]);
    if (st === null) return null;
    starts[i] = st;
    prevOccEnd = st + order[i].dur + order[i].bufAfter;
  }
  for (let p = n - 2; p >= 0; p--) {
    const s = order[p];
    if (!s.movable) continue;
    const k = order[p + 1];
    let latest = starts[p + 1] - k.bufBefore -
      travelMinutes(input, s.location_key, k.location_key) - s.bufAfter - s.dur;
    const wi = windowIndex(starts[p], starts[p] + s.dur, wins);
    if (wi >= 0) latest = Math.min(latest, wins[wi].end - s.dur);
    const a = av[p];
    if (a && a.length) {
      const aw = a.find((w) =>
        starts[p] >= w.start && starts[p] + s.dur <= w.end
      );
      if (aw) latest = Math.min(latest, aw.end - s.dur);
    }
    if (latest > starts[p]) starts[p] = latest;
  }
  return starts;
}

interface DpLabel {
  jIdx: number; // appointment index this label ends at
  finish: number; // occEnd of the last appointment (start + dur + bufAfter)
  travel: number; // cumulative travel minutes incl. the L_start edge leg
  start: number; // chosen start of the last appointment
  parent: DpLabel | null;
}

/**
 * Optimal same-day sequence via Held-Karp over subsets with Pareto (finish,
 * travel) labels (spec §6). Returns the new start times for the movable slots
 * of the day's optimal order when it strictly beats the current arrangement on
 * (w_idle·Idle + w_travel·Travel); null otherwise. Locked slots stay at their
 * fixed times. Feasibility per transition: window + availability + occStart ≥
 * occEnd_prev + travel. n<2 or n>EXACT_DAY_MAX → null (local search suffices).
 */
function bestDayOrder(
  input: SolverInput,
  slots: Slot[],
  date: string,
  K: { MIN_IDLE_GAP: number; W_TRAVEL: number },
): Array<{ slot: Slot; start: number }> | null {
  const day = slots
    .filter((s) => s.date === date)
    .sort((a, b) => a.id.localeCompare(b.id));
  const n = day.length;
  if (n < 2 || n > EXACT_DAY_MAX) return null;
  const wins = capacityWindows(date, input.working_hours, input.holidays);
  if (wins.length === 0) return null;

  const S = input.context.settings;
  const av = day.map((s) => availFor(input, s.patient_id, date));
  const startKey = startLocationKey(input);
  const endKey = endLocationKey(input);
  const tt = (fromIdx: number, toIdx: number) =>
    travelMinutes(input, day[fromIdx].location_key, day[toIdx].location_key);
  const occEndAt = (i: number, start: number) =>
    start + day[i].dur + day[i].bufAfter;

  // Earliest feasible start for appt i with occStart ≥ minOccStart. Body
  // [start, start+dur] must sit in a single window and within availability;
  // buffers may extend into closures (matches feasibleAt). Locked appts keep
  // their fixed start (feasible only if it respects the incoming leg).
  const earliest = (i: number, minOccStart: number): number | null => {
    const s = day[i];
    if (!s.movable) {
      return s.start - s.bufBefore >= minOccStart ? s.start : null;
    }
    let best: number | null = null;
    const avs = av[i];
    const windows = avs && avs.length ? avs : [null];
    for (const w of wins) {
      for (const a of windows) {
        let start = Math.max(w.start, minOccStart + s.bufBefore);
        if (a) start = Math.max(start, a.start);
        if (start < w.start) continue;
        if (start + s.dur > w.end) continue;
        if (a && start + s.dur > a.end) continue;
        if (best === null || start < best) best = start;
      }
    }
    return best;
  };

  const labels = new Map<number, DpLabel[]>(); // key = mask*n + j
  const keyOf = (mask: number, j: number) => mask * n + j;
  const NEG = -1_000_000;

  const addLabel = (mask: number, lab: DpLabel) => {
    const k = keyOf(mask, lab.jIdx);
    const arr = labels.get(k);
    if (!arr) { labels.set(k, [lab]); return; }
    for (const e of arr) {
      if (e.finish <= lab.finish && e.travel <= lab.travel) return; // dominated
    }
    const kept = arr.filter(
      (e) => !(lab.finish <= e.finish && lab.travel <= e.travel),
    );
    kept.push(lab);
    labels.set(k, kept);
  };

  for (let j = 0; j < n; j++) {
    const start = earliest(j, NEG);
    if (start === null) continue;
    addLabel(1 << j, {
      jIdx: j,
      finish: occEndAt(j, start),
      travel: travelMinutes(input, startKey, day[j].location_key),
      start,
      parent: null,
    });
  }

  for (let mask = 1; mask < (1 << n); mask++) {
    for (let j = 0; j < n; j++) {
      if (!(mask & (1 << j))) continue;
      const arr = labels.get(keyOf(mask, j));
      if (!arr) continue;
      for (const lab of arr) {
        for (let k = 0; k < n; k++) {
          if (mask & (1 << k)) continue;
          const start = earliest(k, lab.finish + tt(j, k));
          if (start === null) continue;
          addLabel(mask | (1 << k), {
            jIdx: k,
            finish: occEndAt(k, start),
            travel: lab.travel + tt(j, k),
            start,
            parent: lab,
          });
        }
      }
    }
  }

  // Measure day idle for a candidate assignment (mutate + restore).
  const saved = day.map((s) => s.start);
  const measureIdle = (starts: number[]): number => {
    for (let i = 0; i < n; i++) day[i].start = starts[i];
    const idle = dayIdle(input, slots, date, K.MIN_IDLE_GAP);
    for (let i = 0; i < n; i++) day[i].start = saved[i];
    return idle;
  };

  // Backward gap-closing (spec §4): from the last to the first, delay each
  // movable appointment to hug its successor (occEnd + travel == successor
  // occStart), staying inside its window/availability. This converts internal
  // idle into uncounted free time before the first appointment (e.g. a client
  // free from 09:00 whose successor is only available at 11:00 slides later so
  // the gap disappears). The last appointment has no successor and is never
  // delayed — delaying it would only create idle.
  const backwardClose = (order: number[], starts: number[]) => {
    for (let p = order.length - 2; p >= 0; p--) {
      const i = order[p], k = order[p + 1];
      const s = day[i];
      if (!s.movable) continue;
      let latest = starts[k] - day[k].bufBefore - tt(i, k) - s.bufAfter - s.dur;
      const wi = windowIndex(starts[i], starts[i] + s.dur, wins);
      if (wi >= 0) latest = Math.min(latest, wins[wi].end - s.dur);
      const a = av[i];
      if (a && a.length) {
        const aw = a.find((w) =>
          starts[i] >= w.start && starts[i] + s.dur <= w.end
        );
        if (aw) latest = Math.min(latest, aw.end - s.dur);
      }
      if (latest > starts[i]) starts[i] = latest;
    }
  };

  const full = (1 << n) - 1;
  let bestCost = Infinity;
  let bestStarts: number[] | null = null;
  for (let j = 0; j < n; j++) {
    const arr = labels.get(keyOf(full, j));
    if (!arr) continue;
    for (const lab of arr) {
      const starts = new Array<number>(n).fill(0);
      const order: number[] = [];
      for (let p: DpLabel | null = lab; p; p = p.parent) {
        starts[p.jIdx] = p.start;
        order.push(p.jIdx);
      }
      order.reverse(); // parent walk is last→first
      backwardClose(order, starts);
      const travel = lab.travel +
        travelMinutes(input, day[j].location_key, endKey);
      const cost = K.W_TRAVEL * travel + S.weight_idle_time * measureIdle(starts);
      if (cost < bestCost - 1e-9) { bestCost = cost; bestStarts = starts; }
    }
  }
  if (!bestStarts) return null;

  const curTravel = dayTravel(input, slots, date);
  const curIdle = dayIdle(input, slots, date, K.MIN_IDLE_GAP);
  const curCost = K.W_TRAVEL * curTravel + S.weight_idle_time * curIdle;
  if (bestCost >= curCost - 1e-9) return null; // no strict improvement

  const out: Array<{ slot: Slot; start: number }> = [];
  for (let i = 0; i < n; i++) {
    if (day[i].movable && day[i].start !== bestStarts[i]) {
      out.push({ slot: day[i], start: bestStarts[i] });
    }
  }
  return out.length ? out : null;
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

  // Cross-day RELOCATE (spec §5): try moving each movable appointment to another
  // day in the range, accepted only on strict improvement. With travel in the
  // objective this is what makes geographic clustering emerge on its own (two
  // clients in the same area drift into the same day). existingDateAllowed keeps
  // month runs inside their week bucket (unless cross-week is enabled) and does
  // not restrict week/day runs, which stay within their own range anyway.
  {
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
      if (entry.pool) continue; // pool plans are placed by the dedicated pool phase
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

  // Phase 3b — pool "to plan" insertion (spec §7). Multi-session plans placed by
  // regret-2 insertion: each round, for every plan compute the best and 2nd-best
  // feasible sitting and insert the plan with the largest regret (ΔC₂ − ΔC₁), so
  // the plan that would suffer most from waiting goes first. Each sitting honours
  // patient availability, max_per_week and the minimum gap to the plan's already
  // placed sittings. Unplaceable sittings simply stay in the pool (partial
  // success); creates flow through the normal output contract (appointment_id
  // null).
  if (S.allow_waiting_list) {
    const plans = input.waiting_list.filter((e) => e.pool && !e.advance_for);
    if (plans.length > 0) {
      const days = dateRange(input.context.date_from, input.context.date_to);
      const remaining = new Map(plans.map((p) => [p.id, p.pool!.sessions_total]));
      const placedMs = new Map<string, number[]>(plans.map((p) => [p.id, []]));
      const placedWeek = new Map<string, Map<string, number>>(
        plans.map((p) => [p.id, new Map()]),
      );

      interface Ins { date: string; start: number; deltaC: number; probe: Slot }
      const options = (entry: SolverInput["waiting_list"][number]): Ins[] => {
        const plan = entry.pool!;
        const mine = placedMs.get(entry.id)!;
        const week = placedWeek.get(entry.id)!;
        const { service, dur, price } = wlServiceAndDur(input, entry);
        const found: Ins[] = [];
        for (const date of days) {
          if (!wlDateAllowed(entry, date)) continue;
          if (
            plan.max_per_week > 0 &&
            (week.get(mondayKey(date)) ?? 0) >= plan.max_per_week
          ) continue;
          const probe: Slot = {
            id: `pool:${entry.id}:${mine.length}`,
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
            wlEntryId: entry.id,
          };
          for (const cand of candidateStarts(input, slots, probe, date)) {
            if (!wlTimeOk(entry, cand, dur)) continue;
            const ms = dateTimeMs(date, cand);
            if (
              plan.gap_hours > 0 &&
              mine.some((m) => Math.abs(ms - m) < plan.gap_hours * 3_600_000)
            ) continue;
            if (!feasibleAt(input, slots, probe, date, cand)) continue;
            if (!serviceConstraintsOk(input, service, slots, date, cand)) continue;
            probe.start = cand;
            slots.push(probe);
            const c2 = cost();
            // Accept only when the R_POOL reward outweighs the added idle/travel
            // (C strictly improves). A low R_POOL therefore places fewer sittings.
            const ok = c2.C < cur.C - 1e-9 &&
              c2.idle <= baselineIdle &&
              findHardViolation(input, slots) === null &&
              budgetsOk(input, slots, origin);
            slots.pop();
            if (ok) {
              found.push({ date, start: cand, deltaC: c2.C - cur.C, probe: { ...probe } });
            }
          }
        }
        found.sort((a, b) =>
          a.deltaC - b.deltaC || a.date.localeCompare(b.date) || a.start - b.start
        );
        return found;
      };

      for (;;) {
        let pick: { ins: Ins; regret: number; id: string } | null = null;
        for (const entry of plans) {
          if ((remaining.get(entry.id) ?? 0) <= 0) continue;
          const opts = options(entry);
          if (opts.length === 0) continue;
          const regret = (opts[1]?.deltaC ?? opts[0].deltaC + 1_000_000) -
            opts[0].deltaC;
          if (
            !pick || regret > pick.regret ||
            (regret === pick.regret && opts[0].deltaC < pick.ins.deltaC)
          ) {
            pick = { ins: opts[0], regret, id: entry.id };
          }
        }
        if (!pick) break;
        const p = pick.ins.probe;
        slots.push(p);
        cur = cost();
        remaining.set(pick.id, (remaining.get(pick.id) ?? 0) - 1);
        placedMs.get(pick.id)!.push(dateTimeMs(p.date, p.start));
        const wk = placedWeek.get(pick.id)!;
        wk.set(mondayKey(p.date), (wk.get(mondayKey(p.date)) ?? 0) + 1);
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

  // Phase 5 — exact per-day refinement (spec §6). For each day (n ≤ 13) solve
  // the optimal visiting order + times by Held-Karp DP and adopt it only if it
  // lowers the global objective without raising idle above baseline or breaking
  // budgets/hard constraints. This is what makes the solver actually reorder a
  // day to cut travel; the local search alone never changes the sequence.
  for (const date of dateRange(input.context.date_from, input.context.date_to)) {
    const proposal = bestDayOrder(input, slots, date, K);
    if (!proposal) continue;
    const prev = proposal.map((p) => ({ slot: p.slot, start: p.slot.start }));
    for (const p of proposal) p.slot.start = p.start;
    const c2 = cost();
    if (accept(c2)) {
      cur = c2;
    } else {
      for (const p of prev) p.slot.start = p.start;
    }
  }

  // Phase 5b — 2-OPT + SWAP for large days (spec §5). The exact DP is skipped
  // above EXACT_DAY_MAX, so those days get local reordering instead: reverse a
  // contiguous segment (2-OPT) or exchange two appointments (SWAP), re-time the
  // candidate order (§4) and keep it only on a strictly better, valid schedule.
  {
    const deadline = t0 + Math.min(S.max_solver_seconds, 30) * 1000;
    for (const date of dateRange(input.context.date_from, input.context.date_to)) {
      const size = slots.filter((s) => s.date === date).length;
      if (size <= EXACT_DAY_MAX) continue; // ≤13 already exact via the DP
      let improved = true;
      while (improved && Date.now() < deadline) {
        improved = false;
        const day = slots
          .filter((s) => s.date === date)
          .sort((a, b) => occStart(a) - occStart(b) || a.id.localeCompare(b.id));
        const n = day.length;
        const tryOrder = (order: Slot[]): boolean => {
          const starts = retimeOrder(input, date, order);
          if (!starts) return false;
          const prev = order.map((s) => s.start);
          for (let k = 0; k < order.length; k++) order[k].start = starts[k];
          const c2 = cost();
          if (accept(c2)) { cur = c2; return true; }
          for (let k = 0; k < order.length; k++) order[k].start = prev[k];
          return false;
        };
        outer:
        for (let i = 0; i < n - 1; i++) {
          for (let j = i + 1; j < n; j++) {
            const rev = day.slice();
            let lo = i, hi = j;
            while (lo < hi) { [rev[lo], rev[hi]] = [rev[hi], rev[lo]]; lo++; hi--; }
            if (tryOrder(rev)) { improved = true; break outer; }
            const sw = day.slice();
            [sw[i], sw[j]] = [sw[j], sw[i]];
            if (tryOrder(sw)) { improved = true; break outer; }
          }
        }
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
