import { createClient } from '@/lib/supabase/client'

export interface ParsedCommand {
  patient_name: string
  available: { weekday: string; period: string | null; start_time: string | null; end_time: string | null }[]
  unavailable: { weekday: string; period: string | null }[]
  duration_minutes: number | null
  priority: 'low' | 'normal' | 'high' | null
  notes: string | null
}

export interface ParseResult { commands?: ParsedCommand[]; error?: string; raw?: string }

export async function parseNL(text: string, sessionId: string): Promise<ParseResult> {
  const res = await fetch('/api/ai/parse', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, session_id: sessionId }),
  })
  return res.json()
}

const PERIOD_TIMES: Record<string, [string, string]> = {
  morning: ['09:00:00', '13:00:00'], afternoon: ['14:00:00', '18:00:00'], evening: ['18:00:00', '21:00:00'], any: ['09:00:00', '18:00:00'],
}

function toTime(t: string | null, fallback: string) { return t ? (t.length === 5 ? t + ':00' : t) : fallback }

export async function logAiCommand(businessId: string, text: string, parsed: any) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  await sb.from('ai_commands').insert({
    business_id: businessId, profile_id: user?.id ?? null, input_text: text,
    parsed_json: parsed, ai_provider: 'gemini', ai_model: 'gemini-2.5-flash', success: !parsed?.error,
  })
}

export async function applyCommand(cmd: ParsedCommand, patient: { id: string }) {
  const sb = createClient()
  const priority = cmd.priority || 'normal'
  const rows = (cmd.available || []).map((a) => {
    const [ds, de] = PERIOD_TIMES[a.period || 'any'] || PERIOD_TIMES.any
    return {
      patient_id: patient.id, weekday: a.weekday,
      start_time: toTime(a.start_time, ds), end_time: toTime(a.end_time, de),
      priority, recurring: true,
      notes: cmd.notes || null,
    }
  })
  if (rows.length) {
    const { error } = await sb.from('patient_availability').insert(rows)
    if (error) throw error
  }
  if (cmd.duration_minutes) {
    await sb.from('patients').update({ preferred_duration_minutes: cmd.duration_minutes }).eq('id', patient.id)
  }
  return rows.length
}
