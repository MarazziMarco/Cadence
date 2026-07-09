import { createClient } from '@/lib/supabase/client'

const sb = () => createClient()
const SELECT = '*, patients:patient_id ( first_name, last_name, full_name, color ), services:preferred_service_id ( name, emoji )'

export async function listWaiting(businessId: string) {
  const { data, error } = await sb().from('waiting_list').select(SELECT).eq('business_id', businessId).is('deleted_at', null).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createWaiting(businessId: string, values: any) {
  const { error } = await sb().from('waiting_list').insert({ business_id: businessId, ...values })
  if (error) throw error
}

export async function updateWaiting(id: string, values: any) {
  const { error } = await sb().from('waiting_list').update(values).eq('id', id)
  if (error) throw error
}

export async function deleteWaiting(id: string) {
  const { error } = await sb().from('waiting_list').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
