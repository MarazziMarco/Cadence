'use client'

import { useEffect, useState } from 'react'

import { normalizeLocale, translate, type Locale } from './index'

export const PUBLIC_LOCALE_STORAGE_KEY = 'cadence-landing-locale'

export function readPublicLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  return normalizeLocale(window.localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY))
}

// Public pages have no workspace yet, so they reuse the language selected on
// the landing page. English remains the stable server/first-render fallback.
export function usePublicT(): {
  locale: Locale
  t: (key: string, vars?: Record<string, string | number>) => string
} {
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    const sync = () => setLocale(readPublicLocale())
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return { locale, t: (key, vars) => translate(locale, key, vars) }
}
