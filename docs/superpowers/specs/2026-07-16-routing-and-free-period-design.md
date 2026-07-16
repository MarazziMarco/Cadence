# Cadence Routing and Free-Period Optimization

Date: 2026-07-16

Status: approved design

Scope: route-aware feasibility, balanced and smart-route strategies, and
`Libera questo giorno/pomeriggio`

Dependency: `2026-07-16-client-location-voice-availability-design.md`

## 1. Purpose

Extend the existing schedule optimizer so it never proposes physically
impossible sequences and can optionally optimize both calendar compactness and
the daily route.

Routing uses OpenRouteService and OpenStreetMap data with the free plan. Cadence
must cache results and must never switch automatically to a billable provider.

## 2. Routing Rules

### 2.1 Travel mode

For a plausibly close pair, request the walking route. Use walking when its
actual duration is at most nine minutes. Otherwise use the driving route.

Studio-to-studio travel is always zero.

The workday starts at the studio and ends at the studio. Lunch is not an
automatic return to the studio; it may absorb necessary travel.

### 2.2 Missing location

If the studio has no address or approximate device position:

- studio-to-studio remains zero;
- every studio-to-external or external-to-studio leg uses a conservative
  twenty-minute fallback.

If both external endpoints are known but no route or fresh cached value can be
obtained, the route is unverifiable and the optimizer must report a blocker
instead of inventing a duration.

### 2.3 Hard feasibility

For consecutive appointments:

`previous occupied end + travel duration <= next occupied start`

The same rule applies from the studio to the first appointment and from the
last appointment back to the studio before business closing.

Travel duration is mandatory productive time, not idle time. Recoverable idle
between two appointments is the remaining gap after subtracting required
travel.

## 3. Routing Service and Cache

OpenRouteService calls occur server-side. The API key is never exposed to the
browser.

Geocoding and directed route results are cached by tenant, normalized coordinate
hashes, and travel profile. Cache entries store:

- origin and destination hashes;
- rounded coordinates;
- walking or driving profile;
- duration and distance;
- provider;
- fetched and expiry timestamps.

The default expiry is 30 days. Changing an address hash invalidates dependent
entries. Matrix requests are batched before solving; the pure solver never
performs network I/O.

When the free quota or provider is unavailable, Cadence uses a fresh cached
value. If none exists, it applies only the approved unknown-studio fallback or
reports an unverifiable route.

## 4. Scheduler Strategies

Aggressiveness (`conservative`, `balanced`, `aggressive`) remains separate from
route strategy.

### 4.1 Balanced route strategy

This is the default.

- Travel feasibility is always enforced.
- Calendar compactness and existing move penalties remain primary.
- Route time and distance are a low-weight tie-breaker.
- A move is not proposed solely for route improvement.

### 4.2 Smart Route strategy

This optional Scheduler setting jointly evaluates calendar and itinerary.

- It can reorder appointments within a day.
- It can move appointments to another day inside the permitted week.
- It respects client availability, business hours, locks, service rules,
  move budgets, and week boundaries.
- It may propose a move solely for route improvement only when the final plan
  saves at least ten total travel minutes.
- It must not increase recoverable idle relative to the accepted baseline for
  a route-only move.

The initial algorithm is a deterministic, time-boxed local search using
feasible insertion, swap, relocation, and within-day 2-opt neighborhoods. A
separate fleet-routing infrastructure is not required for the first version.

### 4.3 Preview

Routing-aware previews show:

- travel minutes before and after;
- distance before and after;
- travel saving;
- calendar idle before and after;
- why each move is proposed.

Routing-sensitive plans are applied as exact plans. Individual moves cannot be
unchecked when removing one would make the remaining route infeasible.

## 5. Free Day and Free Afternoon

The calendar exposes:

- `Libera questo giorno`;
- `Libera questo pomeriggio`.

The target range is always the Monday–Sunday week containing the selected day.
Appointments never move outside that week.

The afternoon begins at the configured `afternoon_start` for that weekday. If
it is missing, it begins at 14:00.

Waiting-list insertion is disabled during this operation so newly opened space
is not immediately refilled.

### 5.1 Complete result

The solver treats the selected period as a hard exclusion and attempts to move
every overlapping appointment elsewhere in the week. It searches the most
constrained appointments first.

The preview offers:

- apply all moves;
- cancel and leave the calendar unchanged.

### 5.2 Partial result

If complete evacuation is impossible, the solver computes the largest safe
partial result and lists every blocker, including:

- locked appointment;
- service disallows AI scheduling;
- no feasible client slot;
- move budget exceeded;
- address unresolved;
- route unavailable.

The UI asks: “Questo cliente non può essere spostato. Libero comunque tutto il
resto o lascio tutto così?”

The choices are:

- apply the exact partial plan;
- leave everything unchanged.

No mutation happens before confirmation. Messages precompiled for moved clients
appear after either a complete or accepted partial apply.

## 6. Solver Architecture

### 6.1 Input

Each appointment slot receives a resolved location key. `SolverInput` receives:

- studio/depot location key;
- directed travel-time and distance matrix;
- route strategy;
- optimization goal;
- optional excluded period.

Routing and geocoding are resolved before entering the pure solver.

### 6.2 Candidate generation

Candidate start times include:

- business-window boundaries;
- client-availability boundaries;
- predecessor occupied end plus required travel;
- successor occupied start minus required travel and appointment footprint.

Smart Route additionally evaluates cross-day feasible insertion, swap,
relocation, and route-order improvements.

### 6.3 Apply safety

Optimizer runs snapshot:

- appointment versions;
- resolved location hashes;
- route matrix/cache versions;
- exact selected plan.

Apply revalidates the complete resulting schedule under the existing calendar
locking strategy. It rejects stale appointments, changed addresses, missing
routes, overlaps, or insufficient travel gaps.

Manual create, move, and resize operations use the same cached travel
feasibility rules so a user cannot create a sequence the optimizer would
consider impossible. Warnings may be confirmed only for soft constraints;
insufficient travel time is a hard error.

## 7. Settings

Scheduler settings include:

- route strategy: Balanced or Smart Route;
- walking threshold, default 9 minutes;
- unknown studio leg, default 20 minutes;
- route-only minimum saving, default 10 minutes.

Studio address and approximate device-position capture live in business
Settings. All defaults are persisted per business.

## 8. Testing

Required coverage:

- studio-to-studio zero travel;
- walking at nine minutes and driving above nine minutes;
- directed cache keys, expiry, and address invalidation;
- twenty-minute unknown-studio fallback;
- provider/cache failure for external routes;
- first and last studio legs;
- lunch absorbing travel;
- rejection of back-to-back appointments without sufficient travel;
- travel-adjusted idle metrics;
- Balanced does not move solely for route savings;
- Smart Route moves at ten saved minutes but not nine;
- deterministic results and move-budget enforcement;
- complete free day and free afternoon;
- configured afternoon start and 14:00 fallback;
- locked/unavailable/unroutable partial blockers;
- no cross-week moves and no waiting-list refill;
- exact-plan apply and stale location snapshot rejection;
- precompiled messages after accepted moves.

## 9. Operational and Privacy Constraints

- No paid fallback provider.
- No raw address or API key in logs.
- Tenant isolation and row-level security for route cache.
- Approximate device position is opt-in and stored once, not tracked.
- Provider quota failure produces a clear, recoverable result.

