import { createClient } from '@/lib/supabase/client'

const sb = () => createClient()

// Treatment plans reuse the EXISTING appointments schema — no new tables/columns.
// A plan is a series of linked appointments:
//   - the first session is the "parent": is_recurring = true and recurrence_rule
//     holds the plan metadata as JSON (marked with cadence_plan: true);
//   - every following session points back with parent_appointment_id.
// Progress (completed / remaining) is derived from each session's status.

export interface PlanMeta {
  cadence_plan: true
  treatment_type: string
  total_sessions: number
  sessions_per_week: number
  min_gap_hours: number
  preferred_weekdays: number[] // JS getDay(): 0=Sun .. 6=Sat
  therapist: string | null
  notes: string | null
}

export interface CreatePlanParams {
  patientId: string
  serviceId: string | null
  durationMinutes: number
  price: number | null
  treatmentType: string
  totalSessions: number
  sessionsPerWeek: number
  minGapHours: number
  preferredWeekdays: number[]
  startDate: string // YYYY-MM-DD
  startTime: string // HH:MM
  therapist?: string | null
  notes?: string | null
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function endTime(start: string, durationMinutes: number): string {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + durationMinutes
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`
}

/**
 * Generates the session dates honouring cadence (sessions/week), a minimum gap
 * between sessions, and optional preferred weekdays. Pure and deterministic.
 */
export function generateSessionDates(params: {
  startDate: string
  totalSessions: number
  sessionsPerWeek: number
  minGapHours: number
  preferredWeekdays: number[]
}): string[] {
  const { startDate, totalSessions, sessionsPerWeek, minGapHours, preferredWeekdays } = params
  const minGapDays = Math.max(1, Math.ceil(minGapHours / 24))
  const dates: string[] = []
  let cursor = new Date(startDate + 'T00:00:00')
  let last: Date | null = null

  if (preferredWeekdays.length > 0) {
    // Place on allowed weekdays only, spacing by at least the minimum gap.
    let guard = 0
    while (dates.length < totalSessions && guard < 730) {
      guard++
      const wdOk = preferredWeekdays.includes(cursor.getDay())
      const gapOk = !last || (cursor.getTime() - last.getTime()) / 86400000 >= minGapDays
      if (wdOk && gapOk) {
        dates.push(ymd(cursor))
        last = new Date(cursor)
      }
      cursor = addDays(cursor, 1)
    }
  } else {
    // Even cadence: 7 / sessions-per-week days apart, bumped up to satisfy the gap.
    let interval = Math.max(1, Math.round(7 / Math.max(1, sessionsPerWeek)))
    if (interval < minGapDays) interval = minGapDays
    for (let i = 0; i < totalSessions; i++) {
      dates.push(ymd(cursor))
      cursor = addDays(cursor, interval)
    }
  }
  return dates
}

/** Creates the plan's linked appointments. Returns the parent appointment id. */
export async function createTreatmentPlan(businessId: string, params: CreatePlanParams): Promise<string> {
  const dates = generateSessionDates(params)
  if (dates.length === 0) throw new Error('Nessuna data generata per il piano')

  const meta: PlanMeta = {
    cadence_plan: true,
    treatment_type: params.treatmentType,
    total_sessions: params.totalSessions,
    sessions_per_week: params.sessionsPerWeek,
    min_gap_hours: params.minGapHours,
    preferred_weekdays: params.preferredWeekdays,
    therapist: params.therapist || null,
    notes: params.notes || null,
  }

  const client = sb()
  const startTimeFull = `${params.startTime}:00`
  const end = endTime(params.startTime, params.durationMinutes)

  const base = {
    business_id: businessId,
    patient_id: params.patientId,
    service_id: params.serviceId,
    duration_minutes: params.durationMinutes,
    price: params.price,
    start_time: startTimeFull,
    end_time: end,
    status: 'scheduled' as const,
    source: 'manual' as const,
    title: params.treatmentType,
  }

  // Parent (first session) carries the plan metadata.
  const { data: parent, error: pErr } = await client
    .from('appointments')
    .insert({
      ...base,
      appointment_date: dates[0],
      is_recurring: true,
      recurrence_rule: JSON.stringify(meta),
      internal_notes: params.notes || null,
    })
    .select('id')
    .single()
  if (pErr) throw pErr

  if (dates.length > 1) {
    const children = dates.slice(1).map((d) => ({
      ...base,
      appointment_date: d,
      parent_appointment_id: parent.id,
    }))
    const { error: cErr } = await client.from('appointments').insert(children)
    if (cErr) throw cErr
  }

  return parent.id as string
}

export interface PatientPlan {
  id: string
  treatmentType: string
  total: number
  completed: number
  remaining: number
  nextDate: string | null
  therapist: string | null
  serviceName: string | null
}

/** Loads all treatment plans for a patient with derived progress. */
export async function getPatientPlans(patientId: string): Promise<PatientPlan[]> {
  const { data, error } = await sb()
    .from('appointments')
    .select('id, appointment_date, status, parent_appointment_id, is_recurring, recurrence_rule, services:service_id ( name )')
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .order('appointment_date', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as any[]
  const today = new Date().toISOString().slice(0, 10)

  // Identify plan parents (is_recurring + valid plan metadata).
  const parents = rows.filter((r) => {
    if (!r.is_recurring || !r.recurrence_rule) return false
    try {
      return JSON.parse(r.recurrence_rule)?.cadence_plan === true
    } catch {
      return false
    }
  })

  return parents.map((parent) => {
    const meta = JSON.parse(parent.recurrence_rule) as PlanMeta
    const members = [parent, ...rows.filter((r) => r.parent_appointment_id === parent.id)]
    const completed = members.filter((m) => m.status === 'completed').length
    const total = members.length
    const upcoming = members
      .filter((m) => m.status !== 'completed' && m.status !== 'cancelled' && m.appointment_date >= today)
      .map((m) => m.appointment_date)
      .sort()
    return {
      id: parent.id,
      treatmentType: meta.treatment_type || 'Treatment plan',
      total,
      completed,
      remaining: total - completed,
      nextDate: upcoming[0] ?? null,
      therapist: meta.therapist ?? null,
      serviceName: parent.services?.name ?? null,
    }
  })
}
