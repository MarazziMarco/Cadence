'use client'

import {
  LANDING_LOCALES,
  type LandingLocale,
} from './landing-copy'

const LABELS: Record<LandingLocale, string> = {
  en: 'English',
  it: 'Italiano',
  es: 'Español',
}

export function LandingLanguageSwitcher({
  locale,
  onChange,
}: {
  locale: LandingLocale
  onChange(locale: LandingLocale): void
}) {
  return (
    <div
      aria-label={LABELS[locale]}
      className="inline-flex h-9 items-center rounded-lg border border-border bg-background/80 p-0.5 shadow-sm"
      role="group"
    >
      {LANDING_LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          aria-label={LABELS[item]}
          aria-pressed={locale === item}
          className={`h-8 rounded-md px-2 text-[11px] font-bold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            locale === item
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  )
}
