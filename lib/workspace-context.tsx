'use client'

import { createContext, useContext, type ReactNode } from 'react'

export interface WorkspaceBusiness {
  id: string
  business_name: string
  default_appointment_duration: number
  slot_interval_minutes: number
  currency: string
  language: string
  timezone: string
  lunch_break_enabled: boolean
  lunch_start: string | null
  lunch_end: string | null
}

const Ctx = createContext<{ business: WorkspaceBusiness | null }>({ business: null })

export function WorkspaceProvider({ business, children }: { business: WorkspaceBusiness | null; children: ReactNode }) {
  return <Ctx.Provider value={{ business }}>{children}</Ctx.Provider>
}

export function useWorkspace() {
  return useContext(Ctx)
}

export function useBusinessId() {
  return useContext(Ctx).business?.id ?? null
}

// Currency -> locale so amounts format naturally (separators, symbol position).
// Kept inline (not imported) to avoid a client/type import cycle; mirrors
// CURRENCY_LOCALE in lib/types/db.ts.
const CURRENCY_LOCALE: Record<string, string> = {
  EUR: 'it-IT', USD: 'en-US', GBP: 'en-GB', CHF: 'de-CH',
  CAD: 'en-CA', AUD: 'en-AU', SEK: 'sv-SE', JPY: 'ja-JP',
}

export function formatMoney(amount: number | null | undefined, currency?: string | null) {
  const v = amount ?? 0
  const cur = currency || 'EUR'
  const locale = CURRENCY_LOCALE[cur] || 'en-US'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(v)
  } catch {
    return `${v} ${cur}`
  }
}
