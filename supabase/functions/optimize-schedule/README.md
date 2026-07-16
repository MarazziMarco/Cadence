# optimize-schedule — Cadence scheduler solver (Supabase Edge Function)

Non-destructive schedule optimizer. Reads the live schedule for a business over
a date range, computes a better arrangement (compaction + waiting-list fill +
time-boxed local search), and writes a **preview** into `optimization_runs` +
`optimization_changes`. It never mutates appointments or the waiting list — the
app applies changes later, per-row, on accept.

Spec / source of truth: `cadence_solver_data_contract.md`.

## Architecture

```
index.ts                HTTP entrypoint (Deno). CORS + validation.
                        loadInput -> prepareRoutingInput -> solveCore ->
                        persistOutput -> { run_id }
routing/provider.ts     Server-only OpenRouteService geocoding + batched matrices
routing/cache.ts        Tenant-scoped directed route-cache adapter
routing/matrix.ts       Geocoding dedupe, walk/drive selection, fallback matrix
solver/core.ts          solveCore(input): SolverOutput — PURE, deterministic, zero I/O
solver/types.ts         SolverInput / SolverOutput contracts (§2 / §7)
solver/time.ts          minutes-from-midnight, capacity windows, effective availability
solver/explain.ts       template ai_reason strings (no LLM)
solver/load.ts          loadInput(): Supabase queries -> SolverInput (mandatory filters)
solver/persist.ts       persistOutput(): 1 optimization_runs + N optimization_changes
fixtures/*.json         offline SolverInput cases
test/core.test.ts       deno tests against the fixtures
```

`solveCore` never imports the Supabase client. All DB access lives in `load.ts`
and `persist.ts`, so the optimization math is fully testable offline.

## Deploy (manual — you do this)

The function reads the database directly. It needs these environment secrets,
which Supabase injects automatically for deployed functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTESERVICE_API_KEY`

`OPENROUTESERVICE_API_KEY` is read only inside the Edge Function. It is never
sent to the browser, written to application logs, or included in errors. Cadence
uses no paid routing fallback. When OpenRouteService is unavailable it uses a
fresh tenant-scoped cache entry, the configured unknown-studio fallback, or an
unverifiable external leg that the route-aware solver blocks.

Route preparation batches OpenRouteService matrix requests so every request
contains at most 3,500 directed origin×destination routes. Larger matrices use
the ORS `sources` and `destinations` fields and merge the results before
solving; small matrices remain a single request. Plausibly close locations are
checked with `foot-walking`; walking is selected only when the actual route is
at most `WALK_MAX_MINUTES` (default 9). Other legs use `driving-car`. Unknown
studio-to-external legs use `UNKNOWN_STUDIO_LEG_MINUTES` (default 20). Cache
entries expire after `ROUTE_CACHE_TTL_DAYS` (default 30).

Routing and geocoding are provided by
[OpenRouteService](https://openrouteservice.org/) using
[OpenStreetMap contributors](https://www.openstreetmap.org/copyright) data.

Copy the folder into your Supabase project
(`supabase/functions/optimize-schedule/`) and import/deploy it from the
dashboard. Nothing here hardcodes or logs secrets.

## HTTP API

`POST /functions/v1/optimize-schedule`

Request body:

| field         | type                                         | required | notes                                           |
| ------------- | -------------------------------------------- | -------- | ----------------------------------------------- |
| `business_id` | uuid                                         | yes      |                                                 |
| `date_from`   | `YYYY-MM-DD`                                 | yes      | inclusive                                       |
| `date_to`     | `YYYY-MM-DD`                                 | yes      | inclusive, `>= date_from`                       |
| `settings_id` | uuid                                         | no       | defaults to the active `algorithm_settings` row |
| `mode`        | `conservative` \| `balanced` \| `aggressive` | no       | defaults to the settings row's mode             |
| `profile_id`  | uuid                                         | no       | stored on the run for attribution               |

Response `200`:

```json
{ "run_id": "3f9a2c7e-5b1d-4e88-9c2a-7d6f0b114a21" }
```

Error responses are `{ "error": "<message>" }` with status `400` (bad input) or
`500` (server not configured / internal). Secrets are never echoed.

### Example — curl

```bash
curl -i -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/optimize-schedule" \
  -H "Authorization: Bearer YOUR_SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "business_id": "b1a2c3d4-e5f6-7788-99aa-bbccddeeff00",
        "date_from": "2026-07-13",
        "date_to": "2026-07-19",
        "mode": "balanced"
      }'
```

```
HTTP/2 200
content-type: application/json

{"run_id":"3f9a2c7e-5b1d-4e88-9c2a-7d6f0b114a21"}
```

### Reading the preview

The `run_id` points at one `optimization_runs` row (before/after metrics,
`ai_summary`) and its `optimization_changes` rows (one per move/create, with a
per-row `accepted` flag and a template `ai_reason`). The Preview screen reads
those two tables:

```sql
select * from optimization_runs    where id = :run_id;
select * from optimization_changes where optimization_run_id = :run_id order by created_at;
```

`optimization_changes` has no `kind` column — a **create** is identified by
`appointment_id is null` (and `old_* is null`); a **move** has `appointment_id`
set and non-null `old_*`.

## What `solveCore` returns

Same shape `persistOutput` writes. Real output for
`fixtures/a_interstitial_gap.json` (one 125-minute gap between two appointments;
the second is pulled earlier):

```json
{
  "run": {
    "mode": "balanced",
    "result": "preview",
    "objective_score": 13,
    "idle_minutes_before": 125,
    "idle_minutes_after": 0,
    "moved_appointments": 1,
    "unchanged_appointments": 1,
    "created_appointments": 0,
    "cancelled_appointments": 0,
    "total_appointments": 2,
    "estimated_revenue_before": 100,
    "estimated_revenue_after": 100,
    "ai_summary": "Recuperati 125 min di tempo morto. Spostato 1 appuntamento, 0 VIP toccati."
  },
  "changes": [
    {
      "kind": "move",
      "appointment_id": "appt-2",
      "patient_id": "pat-b",
      "old_date": "2026-07-13",
      "old_start_time": "12:00:00",
      "old_end_time": "12:45:00",
      "new_date": "2026-07-13",
      "new_start_time": "09:55:00",
      "new_end_time": "10:40:00",
      "was_moved": true,
      "ai_reason": "Anticipato di 125 min per ridurre il tempo morto."
    }
  ]
}
```

`objective_score` is `C(S_final)` — lower is better. It can be positive when the
move cost is not fully offset by the free-slot reward, even though real idle
dropped; the headline win is `idle_minutes_before → idle_minutes_after`.

## Local development

```bash
deno task test     # runs test/core.test.ts against the fixtures (no network, no DB)
deno lint
deno fmt
```

### Fixtures

| file                       | exercises                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `a_interstitial_gap.json`  | one large interstitial gap -> compaction pulls an appt earlier                                             |
| `b_patient_blackout.json`  | exception override (11:00–13:00) + full-day blackout blocks a WL fill                                      |
| `c_waiting_list_fill.json` | waiting-list entry matches a residual gap -> a `create` change                                             |
| `d_holiday_and_split.json` | midweek holiday closes a day + `allow_split_days=false` blocks an afternoon WL fill, compaction still runs |

## Guarantees

- **Deterministic**: the local-search RNG is seeded from the input, so the same
  input yields the same preview.
- **No hard-constraint violations**: no overlaps, everything inside working
  hours and effective patient availability, locked / no-AI appointments are
  anchors.
- **Idle never increases**: no candidate state is accepted if total idle would
  exceed the baseline.
- **Move budgets respected**: `max_patient_moves` and `max_daily_moves`.
- **No LLM**: explanations are deterministic templates.
