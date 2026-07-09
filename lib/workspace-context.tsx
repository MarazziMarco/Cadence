'use client'

import { createContext, useContext, type ReactNode } from 'react'

export interface WorkspaceBusiness {
  id: string
  business_name: string
  default_appointment_duration: number
  slot_interval_minutes: number
  currency: string
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

export function formatMoney(amount: number | null | undefined, currency = 'EUR') {
  const v = amount ?? 0
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v)
  } catch {
    return `${v} ${currency}`
  }
}
