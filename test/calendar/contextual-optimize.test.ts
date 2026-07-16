import { describe, expect, it } from 'vitest'

import {
  contextualOptimizationRanges,
  validateContextualOptimization,
} from '@/lib/calendar/contextual-optimization'

describe('contextual optimization orchestration', () => {
  it('derives one exact day and one Monday-Sunday week', () => {
    expect(contextualOptimizationRanges({
      scope: 'day',
      dateFrom: '2026-07-16',
      dateTo: '2026-07-16',
      allowCrossWeek: false,
      maxCrossWeekDays: 7,
    })).toEqual([
      { from: '2026-07-16', to: '2026-07-16', weekKey: null },
    ])
    expect(contextualOptimizationRanges({
      scope: 'week',
      dateFrom: '2026-07-16',
      dateTo: '2026-07-16',
      allowCrossWeek: false,
      maxCrossWeekDays: 7,
    })).toEqual([
      { from: '2026-07-13', to: '2026-07-19', weekKey: '2026-07-13' },
    ])
  })

  it('splits an isolated month into clipped week runs', () => {
    expect(contextualOptimizationRanges({
      scope: 'month',
      dateFrom: '2026-07-16',
      dateTo: '2026-07-16',
      allowCrossWeek: false,
      maxCrossWeekDays: 7,
    })).toEqual([
      { from: '2026-07-01', to: '2026-07-05', weekKey: '2026-07-01' },
      { from: '2026-07-06', to: '2026-07-12', weekKey: '2026-07-06' },
      { from: '2026-07-13', to: '2026-07-19', weekKey: '2026-07-13' },
      { from: '2026-07-20', to: '2026-07-26', weekKey: '2026-07-20' },
      { from: '2026-07-27', to: '2026-07-31', weekKey: '2026-07-27' },
    ])
  })

  it('uses one full-month run when cross-week moves are enabled', () => {
    expect(contextualOptimizationRanges({
      scope: 'month',
      dateFrom: '2026-07-16',
      dateTo: '2026-07-16',
      allowCrossWeek: true,
      maxCrossWeekDays: 7,
    })).toEqual([
      { from: '2026-07-01', to: '2026-07-31', weekKey: null },
    ])
  })

  it('rejects invalid displacement limits', () => {
    expect(validateContextualOptimization({
      scope: 'month',
      dateFrom: '2026-07-16',
      dateTo: '2026-07-31',
      allowCrossWeek: true,
      maxCrossWeekDays: 0,
    })).toBe('maxCrossWeekDays must be between 1 and 31')
    expect(validateContextualOptimization({
      scope: 'month',
      dateFrom: '2026-07-16',
      dateTo: '2026-07-31',
      allowCrossWeek: true,
      maxCrossWeekDays: 32,
    })).toBe('maxCrossWeekDays must be between 1 and 31')
  })
})
