import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyOptimizationBatch,
  undoOptimizationRun,
} from '@/lib/api/scheduler'

describe('atomic optimization API clients', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: vi.fn(() => '11111111-1111-4111-8111-111111111111') },
    })
  })

  it('applies selected changes in one idempotent request', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      appliedChangeIds: ['change-1'],
    }), { status: 200 }))

    await expect(applyOptimizationBatch(
      'business-1',
      ['run-1'],
      ['change-1'],
    )).resolves.toEqual({
      ok: true,
      appliedChangeIds: ['change-1'],
    })
    expect(fetch).toHaveBeenCalledWith('/api/calendar/optimize/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        businessId: 'business-1',
        runIds: ['run-1'],
        selectedChangeIds: ['change-1'],
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }),
    })
  })

  it('undoes through the transactional route and surfaces server errors', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      error: 'stale optimization',
    }), { status: 409 }))

    await expect(
      undoOptimizationRun('business-1', 'run-1'),
    ).rejects.toThrow('stale optimization')
  })
})
