import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  deleteAppointment,
  listAppointments,
  updateAppointment,
} from '@/lib/api/appointments'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('appointment mutation compatibility wrappers', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists the appointment version used by later writes', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const lte = vi.fn(() => ({ order }))
    const gte = vi.fn(() => ({ lte }))
    const is = vi.fn(() => ({ gte }))
    const eq = vi.fn(() => ({ is }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const { createClient } = await import('@/lib/supabase/client')
    vi.mocked(createClient).mockReturnValue({ from } as never)

    await listAppointments(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-01',
      '2026-07-31',
    )

    expect(select).toHaveBeenCalledWith(expect.stringContaining('version'))
  })

  it('uses the loaded expected version without refetching the appointment', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      Response.json({ ok: true, appointment: null, warnings: [] })
    ))
    const { createClient } = await import('@/lib/supabase/client')

    await updateAppointment(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      7,
      { title: 'Updated' },
    )
    await deleteAppointment(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      8,
    )

    expect(createClient).not.toHaveBeenCalled()
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)))
    expect(bodies.map((body) => body.expectedVersion)).toEqual([7, 8])
  })
})
