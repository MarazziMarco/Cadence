import { LegalShell } from '@/components/legal/legal-shell'

export const metadata = { title: 'Terms — Cadence', description: 'Terms of use for the Cadence demonstration project.' }

// Public page — listed in PUBLIC_PREFIXES (lib/supabase/middleware.ts) so it's
// reachable without a session, like /demo. Placeholder copy — not legal advice.
export default function TermsPage() {
  return <LegalShell page="terms" />
}
