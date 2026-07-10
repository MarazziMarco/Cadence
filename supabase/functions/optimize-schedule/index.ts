// Deno HTTP entrypoint for the optimize-schedule Edge Function.
//
// POST body: { business_id, date_from, date_to, settings_id?, mode?, profile_id? }
// Orchestrates loadInput -> solveCore -> persistOutput and returns { run_id }.
//
// Secrets come ONLY from the environment (never hardcoded, never logged):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { solveCore } from "./solver/core.ts";
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
  const profile_id = (body.profile_id as string | undefined) ?? null;

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

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server not configured" }, 500);

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false },
    });

    const input = await loadInput(supabase, {
      business_id,
      date_from,
      date_to,
      settings_id,
      mode,
    });
    const output = solveCore(input);
    const run_id = await persistOutput(supabase, business_id, output, profile_id);

    return json({ run_id });
  } catch (err) {
    // Surface a safe message; never echo secrets or full stack to the client.
    const message = err instanceof Error ? err.message : "internal error";
    return json({ error: message }, 500);
  }
});
