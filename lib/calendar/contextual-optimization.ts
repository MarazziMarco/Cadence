import { monthRange, monthWeekBuckets, weekRange } from './date'

export type ContextualOptimizationScope = 'day' | 'week' | 'month' | 'custom'

export interface ContextualOptimizationInput {
  scope: ContextualOptimizationScope
  dateFrom: string
  dateTo: string
  allowCrossWeek: boolean
  maxCrossWeekDays: number
}

export interface ContextualOptimizationRange {
  from: string
  to: string
  weekKey: string | null
}

export function validateContextualOptimization(
  input: ContextualOptimizationInput,
): string | null {
  if (
    !Number.isInteger(input.maxCrossWeekDays)
    || input.maxCrossWeekDays < 1
    || input.maxCrossWeekDays > 31
  ) {
    return 'maxCrossWeekDays must be between 1 and 31'
  }
  if (input.dateFrom > input.dateTo) return 'dateFrom must be <= dateTo'
  return null
}

export function contextualOptimizationRanges(
  input: ContextualOptimizationInput,
): ContextualOptimizationRange[] {
  const error = validateContextualOptimization(input)
  if (error) throw new RangeError(error)

  if (input.scope === 'day') {
    return [{ from: input.dateFrom, to: input.dateFrom, weekKey: null }]
  }
  if (input.scope === 'week') {
    const range = weekRange(input.dateFrom)
    return [{ ...range, weekKey: range.from }]
  }
  if (input.scope === 'custom') {
    return [{ from: input.dateFrom, to: input.dateTo, weekKey: null }]
  }

  const range = monthRange(input.dateFrom)
  if (input.allowCrossWeek) {
    return [{ ...range, weekKey: null }]
  }
  return monthWeekBuckets(input.dateFrom).map((bucket) => ({
    from: bucket.from,
    to: bucket.to,
    weekKey: bucket.key,
  }))
}
