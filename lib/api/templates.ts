import { createClient } from '@/lib/supabase/client'

const sb = () => createClient()

// Placeholder tokens available to the user in the template editor.
export const TEMPLATE_PLACEHOLDERS = ['{nome}', '{servizio}', '{vecchia_data}', '{vecchia_ora}', '{nuova_data}', '{nuova_ora}'] as const

// Built-in defaults per interface language (same placeholder tokens across languages).
const DEFAULTS: Record<string, string> = {
  it: 'Ciao {nome}, il tuo appuntamento di {servizio} è stato spostato da {vecchia_data} {vecchia_ora} a {nuova_data} {nuova_ora}. Fammi sapere se va bene!',
  en: 'Hi {nome}, your {servizio} appointment has been moved from {vecchia_data} {vecchia_ora} to {nuova_data} {nuova_ora}. Let me know if that works!',
  es: 'Hola {nome}, tu cita de {servizio} se ha movido de {vecchia_data} {vecchia_ora} a {nuova_data} {nuova_ora}. ¡Dime si te va bien!',
}
const FALLBACK_SERVICE: Record<string, string> = { it: 'appuntamento', en: 'appointment', es: 'cita' }

export function serviceFallback(lang: string) { return FALLBACK_SERVICE[lang] || FALLBACK_SERVICE.en }
export function defaultBody(lang: string) { return DEFAULTS[lang] || DEFAULTS.en }

async function businessLanguage(businessId: string): Promise<string> {
  const { data } = await sb().from('business').select('language').eq('id', businessId).single()
  return (data?.language as string) || 'en'
}

// Returns the active "appointment_moved" template body (custom or default) + language.
export async function getMovedTemplate(businessId: string): Promise<{ id: string | null; body: string; language: string }> {
  const lang = await businessLanguage(businessId)
  const { data: tpl } = await sb()
    .from('templates')
    .select('id, body')
    .eq('business_id', businessId)
    .eq('type', 'appointment_moved')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { id: tpl?.id ?? null, body: (tpl?.body as string) || defaultBody(lang), language: lang }
}

// Upsert the business "appointment_moved" template (no schema change; existing table).
export async function saveMovedTemplate(businessId: string, body: string): Promise<void> {
  const client = sb()
  const lang = await businessLanguage(businessId)
  const { data: existing } = await client
    .from('templates')
    .select('id')
    .eq('business_id', businessId)
    .eq('type', 'appointment_moved')
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    const { error } = await client.from('templates').update({ body, is_active: true }).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await client.from('templates').insert({
      business_id: businessId, type: 'appointment_moved', title: 'Appointment moved',
      body, language: lang, channel: 'system', is_default: true, is_active: true,
    })
    if (error) throw error
  }
}

// Fetch service names for a set of appointment ids (moves carry appointment_id).
export async function serviceNamesForAppointments(appointmentIds: string[]): Promise<Record<string, string>> {
  if (!appointmentIds.length) return {}
  const { data } = await sb().from('appointments').select('id, services:service_id ( name )').in('id', appointmentIds)
  const map: Record<string, string> = {}
  ;(data ?? []).forEach((a: any) => { if (a?.services?.name) map[a.id] = a.services.name })
  return map
}

export function fmtDate(dateStr: string | null, lang: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T00:00:00')
    const locale = lang === 'it' ? 'it-IT' : lang === 'es' ? 'es-ES' : 'en-US'
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
  } catch { return dateStr }
}
export function fmtHour(t: string | null): string { return t ? t.slice(0, 5) : '—' }

export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] ?? `{${k}}`))
}
