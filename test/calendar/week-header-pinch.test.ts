import { describe, expect, it } from 'vitest'

import { weekPinchStep } from '@/hooks/use-week-header-pinch'

describe('week header pinch', () => {
  it('zooms continuously and clamps at three and seven days', () => {
    expect(weekPinchStep({
      visibleDays: 7,
      previousDistance: 100,
      nextDistance: 140,
    })).toBe(5)
    expect(weekPinchStep({
      visibleDays: 3.2,
      previousDistance: 100,
      nextDistance: 200,
    })).toBe(3)
    expect(weekPinchStep({
      visibleDays: 6,
      previousDistance: 120,
      nextDistance: 60,
    })).toBe(7)
  })
})
