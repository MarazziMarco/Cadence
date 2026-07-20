import { AlertTriangle } from 'lucide-react'
import { normalizeLocale, translate, type Locale } from '@/lib/i18n'

export function Disclaimer({ lang = 'en', variant = 'full' }: { lang?: string | 'both'; variant?: 'full' | 'compact' }) {
  const langs: Locale[] = lang === 'both' ? ['en', 'it', 'es'] : [normalizeLocale(lang)]

  if (variant === 'compact') {
    return (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <span>{translate(langs[0], 'legal.disclaimerCompact')}</span>
      </p>
    )
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning" /> {translate(langs[0], 'legal.disclaimerTitle')}
      </div>
      <div className="space-y-3">
        {langs.map((l) => (
          <p key={l} className="text-sm text-muted-foreground">{translate(l, 'legal.disclaimerBody')}</p>
        ))}
      </div>
    </div>
  )
}
