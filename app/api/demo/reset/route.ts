import { NextResponse } from 'next/server'
// @ts-expect-error — plain .mjs helper, no types
import { resetDemo, DEMO_EMAIL, DEMO_PASSWORD } from '@/scripts/seed-demo.mjs'

// Wipes and re-seeds the shared demo account with fresh English fake data, so
// every visitor who logs in as the demo user starts from a clean, full state
// regardless of what the previous visitor changed. Service-role only, so this
// runs server-side; the key never reaches the browser.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await resetDemo()
    return NextResponse.json({ ok: true, email: DEMO_EMAIL, password: DEMO_PASSWORD, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'reset failed' }, { status: 500 })
  }
}
