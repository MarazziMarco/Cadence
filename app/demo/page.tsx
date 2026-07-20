import { DemoPageClient } from '@/components/demo/demo-page-client'

export const metadata = {
  title: 'Demo — Cadence',
  description: 'Try Cadence without signing up: optimize a sample schedule in real time.',
}

// Public route — intentionally NOT under app/(app) or app/(auth), and not
// listed in PROTECTED_PREFIXES (lib/supabase/middleware.ts), so it's reachable
// without a session. Everything here runs client-side, in memory.
export default function DemoPage() {
  return <DemoPageClient />
}
