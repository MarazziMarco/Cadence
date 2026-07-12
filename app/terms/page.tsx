import { LegalShell, LegalSection } from '@/components/legal/legal-shell'

export const metadata = { title: 'Terms — Cadence', description: 'Terms of use for the Cadence demonstration project.' }

// Public page — listed in PUBLIC_PREFIXES (lib/supabase/middleware.ts) so it's
// reachable without a session, like /demo. Placeholder copy — not legal advice.
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Use" updated="July 2026">
      <LegalSection heading="Nature of the service">
        <p>Cadence is a demonstration project / prototype. These terms are a placeholder and will be replaced with full, reviewed terms before any real-world, production use with real data.</p>
      </LegalSection>
      <LegalSection heading="Permitted use">
        <p>Cadence is provided for evaluation and demonstration only. Do not rely on it for critical scheduling, and do not enter real patient or client data. Demo mode runs entirely in your browser and stores nothing.</p>
      </LegalSection>
      <LegalSection heading="No warranty">
        <p>The service is provided “as is”, without warranties of any kind — including availability, accuracy, security, backup, or fitness for a particular purpose.</p>
      </LegalSection>
      <LegalSection heading="Limitation of liability">
        <p>Use is at your own risk. The author accepts no liability for any loss or damage arising from use of this prototype.</p>
      </LegalSection>
      <LegalSection heading="Changes">
        <p>These terms may change at any time. Continued use after a change means you accept the updated terms.</p>
      </LegalSection>
      <LegalSection heading="Contact">
        <p>Questions? <a href="mailto:marazzi.marco@yahoo.com" className="text-primary hover:underline">marazzi.marco@yahoo.com</a></p>
      </LegalSection>
    </LegalShell>
  )
}
