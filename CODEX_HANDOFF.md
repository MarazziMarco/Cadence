# Cadence — Handoff (for Codex / next agent)

Short context dump. Read before touching the repo.

## What the app is
**Cadence** — AI scheduling app for appointment-based small businesses (physio, salon, trainer, clinic…). Core value: one-click optimizer rebuilds the week to close idle gaps between appointments, fills freed slots from a waiting list, and proposes moves you preview + apply.

**Stack**: Next.js 15 (App Router) + Supabase (Postgres, RLS, SSR client) + TypeScript + Tailwind + shadcn/ui (vendored as untyped `.jsx` — hence `typescript.ignoreBuildErrors: true` in next.config; `next build` passing with "Errors: 0" is the green signal). Optimizer is a Supabase **Edge Function** `optimize-schedule` (Deno, pure solver in `supabase/functions/optimize-schedule/solver/`, offline tests via `deno test --allow-read`).

## Demo account (share-safe)
- Login: **`test@cadence.com` / `Cadence!`**
- Seeded/reset by `scripts/seed-demo.mjs` (English fake data: 12 clients, 4 services, ~60 scattered appts over 4 weeks, 1 "advance" waiting-list entry). Run: `node scripts/seed-demo.mjs`.
- `POST /api/demo/reset` reuses `resetDemo()`; the landing "Try the full app (demo login)" button resets to fresh data then logs in → every visitor starts clean.
- Also a no-login in-memory demo at `/demo`.

## Keys / secrets
- `.env.local` (gitignored) holds `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by the seed script + `/api/demo/reset`).
- ⚠️ The service-role key was pasted in a chat once — **rotate it in the Supabase dashboard** and update `.env.local` + the deploy env (emergent/Vercel).
- Supabase project ref: `nvfdcrgmbtwlvejhzofo`.

## Done recently (this session)
1. **Advance / "move-me-up"**: client books far, flags "move up if earlier slot frees"; solver Phase 1.5 pre-pass pulls them ≥3 days earlier before shuffling others (`PRIORITIZE_ADVANCE` metadata toggle, default on). Waiting-list entry stores `notes={advance_for:<apptId>}`. **Solver edited → must redeploy: `supabase functions deploy optimize-schedule`.**
2. **Voice parser** (`lib/voice/parse-appointment.ts`) also reads availability/time-of-day preferences ("Anna only Mondays, prefers mornings").
3. **Signup**: two required checkboxes (Terms/Privacy + "under development, not for sensitive data").
4. **Full i18n EN/IT/ES** (`lib/i18n/`): `dictionaries.ts` + `translate()` + `useT()` hook reading `business.language`; changing language in Settings → Preferences `router.refresh()`es and re-translates. Currency already app-wide via `formatMoney(amount, business.currency)`. Translated: nav/shell, dashboard, calendar, scheduler, waiting list, clients, services, settings, preferences, all main dialogs, onboarding, history, lab, moved-messages. Still English-only: analytics, templates UI, working-hours, ai-assistant, voice-appointment (own EN/IT). Public/auth pages default English (no business context).
5. **Optimize UX**: Scheduler "Optimize" now opens a **modal** (was inline preview below the card). Week shows from–to. Shared `components/calendar/optimize-preview.tsx` used by Scheduler + calendar `OptimizeDialog`: every change ticked by default, untick to skip, **one "Apply (N)" button** batches via `lib/api/scheduler.applyChanges`.

## Open / watch out
- "Day" optimize returning nothing may be server-side in the Edge Function (needs its logs); client now always shows the modal result.
- Mobile behaviour of the Scheduler optimize button unverified.
- **Do NOT restructure `public/` image folders or `.emergent/`** — emergent's deploy reads them as-is.
- Git: default branch `main`, author Marco Marazzi. Commit/push only when asked. There's an old `origin/conflict_100726_1121` emergent auto-branch — ignore it (older, no images).
