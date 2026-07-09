import { createClient } from '@/lib/supabase/client'
import type { Service } from '@/lib/types/db'

const sb = () => createClient()

export async function listServices(businessId: string): Promise<Service[]> {
  const { data, error } = await sb().from('services').select('*').eq('business_id', businessId).is('deleted_at', null).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Service[]
}

export async function createService(businessId: string, values: any): Promise<Service> {
  const { data, error } = await sb().from('services').insert({ business_id: businessId, ...values }).select('*').single()
  if (error) throw error
  return data as Service
}

export async function updateService(id: string, values: any): Promise<Service> {
  const { data, error } = await sb().from('services').update(values).eq('id', id).select('*').single()
  if (error) throw error
  return data as Service
}

export async function softDeleteService(id: string): Promise<void> {
  const { error } = await sb().from('services').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function toggleServiceActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await sb().from('services').update({ is_active }).eq('id', id)
  if (error) throw error
}
