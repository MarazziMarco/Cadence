'use client'

import { useWorkspace } from '@/lib/workspace-context'
import { normalizeLocale, translate, type Locale } from './index'

// Reads the current locale from the workspace business.language. When the user
// changes the language in Settings we router.refresh(), the server re-renders
// with the new business row, and every component using useT() re-translates.
export function useT(): { locale: Locale; t: (key: string, vars?: Record<string, string | number>) => string } {
  const { business } = useWorkspace()
  const locale = normalizeLocale(business?.language)
  return { locale, t: (key, vars) => translate(locale, key, vars) }
}
