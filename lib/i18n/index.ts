// Lightweight app i18n. Dictionaries are flat dotted keys; missing keys fall
// back to English, then to the key itself, so a half-translated string never
// crashes the UI. Locale comes from business.language (see useT below).

import { DICTS } from './dictionaries'

export type Locale = 'en' | 'it' | 'es'
export const LOCALES: Locale[] = ['en', 'it', 'es']

export function normalizeLocale(lang?: string | null): Locale {
  const l = (lang || 'en').toLowerCase().slice(0, 2)
  return (LOCALES as string[]).includes(l) ? (l as Locale) : 'en'
}

// BCP-47 tag for Intl date/number formatting per app locale.
const BCP47: Record<Locale, string> = { en: 'en-US', it: 'it-IT', es: 'es-ES' }
export function bcp47(locale: Locale): string {
  return BCP47[locale] || 'en-US'
}

// Map a nav href to its translation key (shared by sidebar, bottom nav, title).
const NAV_KEYS: Record<string, string> = {
  '/dashboard': 'nav.dashboard', '/calendar': 'nav.calendar', '/patients': 'nav.patients',
  '/services': 'nav.services', '/scheduler': 'nav.scheduler', '/settings': 'nav.settings',
  '/waiting': 'nav.waiting', '/history': 'nav.history', '/analytics': 'nav.analytics',
  '/templates': 'nav.templates', '/working-hours': 'nav.workingHours', '/lab': 'nav.lab',
  '/settings/preferences': 'nav.preferences',
}
export function navKey(href: string): string | null {
  return NAV_KEYS[href] ?? null
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const d = DICTS[locale] || DICTS.en
  let s = d[key] ?? DICTS.en[key] ?? key
  if (vars) for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, String(vars[k]))
  return s
}
