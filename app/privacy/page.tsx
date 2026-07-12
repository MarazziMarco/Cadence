import { LegalShell, LegalSection } from '@/components/legal/legal-shell'

export const metadata = { title: 'Privacy — Cadence', description: 'Privacy notice for the Cadence demonstration project.' }

// Public page — listed in PUBLIC_PREFIXES (lib/supabase/middleware.ts) so it's
// reachable without a session, like /demo. Placeholder copy — not legal advice.
export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Notice" updated="July 2026">
      <LegalSection heading="Nature of this notice">
        <p>Cadence is a demonstration project / prototype. This notice is a placeholder and will be replaced with a full, reviewed privacy policy before any real-world use with real data. Please do not enter real patient or client information.</p>
      </LegalSection>
      <LegalSection heading="What data is involved">
        <p>If you create an account, you provide details such as your name, email and business settings. Any appointments or clients you add are the data you enter yourself, used only to make the app work for you. Demo mode (/demo) stores nothing — it runs entirely in your browser.</p>
      </LegalSection>
      <LegalSection heading="How it is used">
        <p>Data is used only to operate the app for you. It is not sold. As a prototype, no guarantees are made about storage, security, backup or retention.</p>
      </LegalSection>
      <LegalSection heading="Where it is stored">
        <p>The app’s backend uses Supabase. Because this is a prototype, you should assume it is not hardened for sensitive or regulated data.</p>
      </LegalSection>
      <LegalSection heading="Your choices">
        <p>You can request deletion of any account data by contacting the author. Given the prototype nature, keep test data non-sensitive.</p>
      </LegalSection>
      <LegalSection heading="Contact">
        <p>Questions or deletion requests: <a href="mailto:marazzi.marco@yahoo.com" className="text-primary hover:underline">marazzi.marco@yahoo.com</a></p>
      </LegalSection>
    </LegalShell>
  )
}
