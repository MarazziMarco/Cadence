/// <reference lib="deno.ns" />

// Deno HTTP entrypoint for the optimize-schedule Edge Function.
//
// POST body: { business_id, date_from, date_to, settings_id?, mode?, scope_*? }
// Orchestrates loadInput -> prepareRoutingInput -> solveCore -> persistOutput
// and returns { run_id }.
//
// Secrets come ONLY from the environment (never hardcoded, never logged):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTESERVICE_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { prepareRoutingInput } from "./routing/matrix.ts";
import { runFreePeriod, solveCore } from "./solver/core.ts";
import { loadInput } from "./solver/load.ts";
import { persistOutput } from "./solver/persist.ts";
import type { Mode } from "./solver/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODES: Mode[] = ["conservative", "balanced", "aggressive"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const business_id = body.business_id as string | undefined;
  const date_from = body.date_from as string | undefined;
  const date_to = body.date_to as string | undefined;
  const settings_id = body.settings_id as string | undefined;
  const mode = body.mode as Mode | undefined;
  const batch_id = (body.batch_id as string | undefined) ?? crypto.randomUUID();
  const scope_kind = (
    body.scope_kind as "day" | "week" | "month" | "custom" | undefined
  ) ?? (date_from === date_to ? "day" : "custom");
  const week_key = (body.week_key as string | undefined) ?? null;
  const allow_cross_week = body.allow_cross_week === true;
  const max_cross_week_days = Number(body.max_cross_week_days ?? 7);
  const free_period = body.free_period as
    | { date: string; start_minute: number; end_minute: number }
    | undefined;

  if (!business_id) return json({ error: "business_id is required" }, 400);
  if (!date_from || !DATE_RE.test(date_from)) {
    return json({ error: "date_from must be YYYY-MM-DD" }, 400);
  }
  if (!date_to || !DATE_RE.test(date_to)) {
    return json({ error: "date_to must be YYYY-MM-DD" }, 400);
  }
  if (date_from > date_to) {
    return json({ error: "date_from must be <= date_to" }, 400);
  }
  if (mode && !MODES.includes(mode)) {
    return json({ error: `mode must be one of ${MODES.join(", ")}` }, 400);
  }
  if (!["day", "week", "month", "custom"].includes(scope_kind)) {
    return json({ error: "invalid scope_kind" }, 400);
  }
  if (
    !Number.isInteger(max_cross_week_days) ||
    max_cross_week_days < 1 ||
    max_cross_week_days > 31
  ) {
    return json({ error: "max_cross_week_days must be between 1 and 31" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) {
    return json({ error: "server not configured" }, 500);
  }
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await authClient.auth
      .getUser();
    if (userError || !user) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const { data: business, error: businessError } = await supabase
      .from("business")
      .select("id, profile_id")
      .eq("id", business_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business || business.profile_id !== user.id) {
      return json({ error: "forbidden" }, 403);
    }

    const input = await loadInput(supabase, {
      business_id,
      date_from,
      date_to,
      settings_id,
      mode,
      scope_kind,
      week_key,
      allow_cross_week,
      max_cross_week_days,
    });
    const metadata = input.context.settings.metadata ?? {};
    const routedInput = await prepareRoutingInput(supabase, input, {
      walkingThresholdMinutes: numberSetting(
        metadata,
        "WALK_MAX_MINUTES",
        9,
        1,
        60,
      ),
      unknownStudioLegMinutes: numberSetting(
        metadata,
        "UNKNOWN_STUDIO_LEG_MINUTES",
        20,
        0,
        180,
      ),
      plausibleWalkingMeters: numberSetting(
        metadata,
        "PLAUSIBLE_WALKING_METERS",
        2_000,
        100,
        10_000,
      ),
      cacheTtlDays: numberSetting(
        metadata,
        "ROUTE_CACHE_TTL_DAYS",
        30,
        1,
        365,
      ),
      startLocation: edgeLocation(metadata.start_location),
      endLocation: edgeLocation(metadata.end_location),
    });
    // Free-a-day / free-an-afternoon: evacuate the excluded period instead of a
    // full optimization. The result is an exact plan (apply all-or-nothing).
    if (
      free_period && DATE_RE.test(free_period.date) &&
      Number.isFinite(free_period.start_minute) &&
      Number.isFinite(free_period.end_minute) &&
      free_period.end_minute > free_period.start_minute
    ) {
      const fp = runFreePeriod(routedInput, {
        date: free_period.date,
        startMinute: Number(free_period.start_minute),
        endMinute: Number(free_period.end_minute),
      });
      const run_id = await persistOutput(supabase, {
        businessId: business_id,
        output: fp.output,
        input: routedInput,
        profileId: user.id,
        batchId: batch_id,
        scopeKind: scope_kind,
        scopeFrom: date_from,
        scopeTo: date_to,
        weekKey: week_key,
        allowCrossWeek: allow_cross_week,
      });
      return json({
        run_id,
        exact_plan: true,
        completion: fp.completion,
        blockers: fp.blockers,
      });
    }

    const output = solveCore(routedInput);
    const run_id = await persistOutput(supabase, {
      businessId: business_id,
      output,
      input: routedInput,
      profileId: user.id,
      batchId: batch_id,
      scopeKind: scope_kind,
      scopeFrom: date_from,
      scopeTo: date_to,
      weekKey: week_key,
      allowCrossWeek: allow_cross_week,
    });

    return json({ run_id });
  } catch (err) {
    // Surface a safe message; never echo secrets or full stack to the client.
    const message = err instanceof Error ? err.message : "internal error";
    return json({ error: message }, 500);
  }
});

// Day start/end point from algorithm_settings.metadata: an object with finite
// {latitude, longitude} (geocoded like appointment addresses). Anything else →
// null (the solver then defaults the edge point to the studio). Spec §1.
function edgeLocation(
  raw: unknown,
): { latitude: number; longitude: number } | null {
  const p = raw as { latitude?: unknown; longitude?: unknown } | null;
  const lat = Number(p?.latitude);
  const lng = Number(p?.longitude);
  if (p && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { latitude: lat, longitude: lng };
  }
  return null;
}

function numberSetting(
  metadata: object,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(
    (metadata as Record<string, unknown>)[key] ?? fallback,
  );
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}
