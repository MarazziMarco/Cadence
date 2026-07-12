import { AlertTriangle } from 'lucide-react'

// Honest prototype disclaimer, reused in /terms, /privacy, the footer and
// onboarding. English by default, Italian when the interface language is IT.
const TEXT = {
  en: {
    title: 'Demonstration project — not for real use',
    body: 'Cadence is a demonstration project / prototype, built for a development challenge. It is not intended for real professional or clinical use, and must not be used to manage real patient data or actual business operations. Any data you enter is for demonstration only — no guarantees of availability, security, backup, or regulatory compliance (including health-data privacy laws). Use at your own risk; the author accepts no liability for damages arising from use of this prototype.',
    compact: 'Cadence is a demo / prototype — not for real professional, clinical or patient data. Use at your own risk.',
  },
  it: {
    title: 'Progetto dimostrativo — non per uso reale',
    body: "Cadence è un progetto dimostrativo / prototipo, sviluppato nell'ambito di una sfida di sviluppo. Non è destinato all'uso professionale o clinico reale e non deve essere usato per gestire dati reali di pazienti o attività professionali effettive. I dati inseriti sono a scopo dimostrativo; non si forniscono garanzie di disponibilità, sicurezza, backup o conformità normativa (incluse le normative sulla privacy dei dati sanitari). L'uso è a proprio rischio; l'autore non si assume responsabilità per eventuali danni derivanti dall'uso del prototipo.",
    compact: "Cadence è un demo / prototipo — non per dati reali professionali, clinici o di pazienti. Uso a proprio rischio.",
  },
} as const

export function Disclaimer({ lang = 'en', variant = 'full' }: { lang?: 'en' | 'it' | 'both'; variant?: 'full' | 'compact' }) {
  const langs: ('en' | 'it')[] = lang === 'both' ? ['en', 'it'] : [lang]

  if (variant === 'compact') {
    const t = TEXT[langs[0]]
    return (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <span>{t.compact}</span>
      </p>
    )
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning" /> {TEXT[langs[0]].title}
      </div>
      <div className="space-y-3">
        {langs.map((l) => (
          <p key={l} className="text-sm text-muted-foreground">{TEXT[l].body}</p>
        ))}
      </div>
    </div>
  )
}
