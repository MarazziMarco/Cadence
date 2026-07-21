import { NextResponse } from 'next/server'
// @ts-expect-error — plain .mjs helper, no types
import { resetDemo } from '@/scripts/seed-demo.mjs'

// Wipes and re-seeds the shared demo account with fresh English fake data, so
// every visitor who logs in as the demo user starts from a clean, full state
// regardless of what the previous visitor changed. Service-role only, so this
// runs server-side; the key never reaches the browser.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cooldown so the public reset (service-role) can't be hammered: at most one
// actual reseed per window; rapid/concurrent calls no-op. The demo login ignores
// the response anyway. GDPR audit 04.
const COOLDOWN_MS = 15_000
let lastReset = 0
let inFlight = false

export async function POST() {
  const now = Date.now()
  if (inFlight || now - lastReset < COOLDOWN_MS) {
    return NextResponse.json({ ok: true, skipped: true })
  }
  inFlight = true
  try {
    await resetDemo()
    lastReset = Date.now()
    // Do not return credentials in the response (they live in the demo login UI).
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'reset failed' }, { status: 500 })
  } finally {
    inFlight = false
  }
}
