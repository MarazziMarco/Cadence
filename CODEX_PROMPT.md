# Ready-to-paste prompt for Codex

Copy everything below the line into Codex as the opening prompt.

---

You are working on **Cadence**, a web app I built. Read this before doing anything, then wait for my task.

## What Cadence is
An **AI scheduling app for appointment-based small businesses** (physiotherapists, salons, personal trainers, clinics, freelancers). The problem it solves: these pros waste nights and weekends manually rearranging next week's appointments to close the dead gaps between them. Cadence does it in one click.

**Core feature — the optimizer**: rebuilds the schedule to (1) pull appointments earlier and close idle gaps, (2) fill freed slots with clients from a waiting list, (3) respect hard constraints (working hours, lunch break, each client's availability, no overlaps, idle time never increases). Every change is a **preview** the user accepts/applies — nothing moves silently. There's also voice booking ("Marco tomorrow 3pm physiotherapy", including availability/preferences) and a "move-me-up / advance" feature (a client booked far out gets pulled into an earlier freed slot before everyone else is shuffled).

## Goal / context
Built as a **prototype for a development challenge/contest** (deployed via **emergent**). It's a demonstration project — NOT for real/sensitive patient data yet (the signup makes users acknowledge this). Priority is a polished, fully-working demo that shows off the optimizer, voice, and multi-language UI.

## Stack
- **Next.js 15** (App Router) + **TypeScript** + **Tailwind** + **shadcn/ui** (vendored as untyped `.jsx` → `typescript.ignoreBuildErrors: true`; a passing `next build` with "Errors: 0" is the green signal).
- **Supabase**: Postgres + RLS + SSR/browser clients. Auth = Supabase Auth.
- **Optimizer** = Supabase **Edge Function** `optimize-schedule` (Deno, pure solver in `supabase/functions/optimize-schedule/solver/`). Offline tests: `cd supabase/functions/optimize-schedule && deno test --allow-read`. **After ANY solver edit you must redeploy: `supabase functions deploy optimize-schedule`.**
- i18n: `lib/i18n/` — flat dicts EN/IT/ES, `useT()` hook reads `business.language`; changing language in Settings→Preferences `router.refresh()`es and re-translates. Currency app-wide via `formatMoney(amount, business.currency)`.

## Repo / run
- GitHub: `github.com/MarazziMarco/Cadence`, default branch `main`.
- `npm run dev` (port 3000). Build check: `npx next build`.
- **Do NOT restructure `public/` image folders or `.emergent/`** — emergent's deploy reads them as-is.
- Commit/push only when I ask. Author: Marco Marazzi.

## Demo account (already seeded)
- Login: **test@cadence.com / Cadence!**
- `scripts/seed-demo.mjs` (service-role) seeds/reset English fake data (12 clients, 4 services, ~60 scattered appts / 4 weeks, 1 advance entry). `POST /api/demo/reset` reuses it; the landing "full app demo" button resets to fresh data then logs in, so every visitor starts clean. There's also a no-login in-memory demo at `/demo`.

## Secrets
- `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only — used by the seed script + `/api/demo/reset`; never expose to the client).
- Supabase project ref: `nvfdcrgmbtwlvejhzofo`.

## Current state / known open items
- Recently shipped: advance/move-up feature, voice availability parsing, signup consent checkboxes, full EN/IT/ES i18n, shared demo account, optimizer result now shown in a **modal** with a single **"Apply (N)" batch button** (each change ticked by default, untick to skip) — shared by the Scheduler and the calendar Optimize dialog.
- Still English-only (not yet translated): analytics, templates UI, working-hours, ai-assistant pages.
- Open bug to verify: the Scheduler "Optimize" **day** range sometimes returns no changes — the client now always shows the modal result, but if a day with obvious gaps returns nothing, the cause is server-side in the `optimize-schedule` Edge Function (check its logs).
- `CODEX_HANDOFF.md` in the repo root has the same context in note form.

Confirm you've read this, then ask me what to work on.
